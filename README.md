# AI Code Review Platform

A production-grade AI code review platform that integrates directly with GitHub, when a developer opens a pull request or pushes new commits to an open PR, GitHub sends a signed webhook to the platform, the webhook handler verifies the signature, deduplicates using PR number and commit SHA, and enqueues a review job in SQS FIFO. A reviewer Lambda picks up the job, fetches the diff, calls GPT-4o-mini with a structured prompt, parses the JSON response into Security, Performance, and Quality categories with severity ratings, stores the result in DynamoDB, and posts the formatted feedback back to the PR as a GitHub comment. The Next.js dashboard shows all reviews with real-time state machine status (PENDING → PROCESSING → COMPLETED / FAILED), structured findings with severity badges, remediation advice, and a direct link to the original PR. A dead letter queue catches failed jobs with a CloudWatch alarm.

---

## Live Demo

**[Open AI Code Review Platform →](https://ai-code-review-platform-peach.vercel.app/)**

---

## What It Does

- **GitHub webhook integration** — triggers on PR opened and PR updated (new commits pushed to open PRs)
- **Webhook signature verification** — HMAC-SHA256 signature verified on every incoming event before processing
- **Idempotent deduplication** — PR number + commit SHA used as deduplication key, duplicate webhook events silently dropped
- **Async review pipeline** — SQS FIFO queue decouples webhook ingestion from review processing, preventing API Gateway timeouts
- **Review state machine** — explicit PENDING → PROCESSING → COMPLETED / FAILED transitions stored in DynamoDB
- **Structured AI feedback** — GPT-4o-mini returns JSON with Security, Performance, and Quality categories, each finding has severity (CRITICAL/HIGH/MEDIUM/LOW), description, and remediation advice
- **GitHub PR comments** — formatted review posted automatically to the PR with overall score, category summary table, and link back to the dashboard
- **Dead letter queue** — failed review jobs after 3 retries go to a DLQ with a CloudWatch alarm monitoring queue depth
- **Real-time dashboard** — Next.js frontend polls every 5 seconds, showing live status transitions without manual refresh

---

## Architecture

```
GitHub PR opened / updated
        │
        │ Webhook (HMAC-SHA256 signed)
        ▼
API Gateway → Lambda — webhook_handler
        │
        ├── Verify signature
        ├── Deduplicate (PR# + commit SHA → DynamoDB)
        ├── Create PENDING review record
        └── Enqueue to SQS FIFO
                │
                ▼
        Lambda — reviewer (SQS trigger)
                │
                ├── Transition to PROCESSING
                ├── Fetch PR diff (GitHub API)
                ├── Call GPT-4o-mini (structured JSON prompt)
                ├── Parse Security / Performance / Quality findings
                ├── Store results in DynamoDB
                ├── Transition to COMPLETED
                └── Post formatted comment to GitHub PR
                        │
                        ▼ (on failure after 3 retries)
                SQS Dead Letter Queue
                        │
                        ▼
                CloudWatch Alarm (DLQ depth > 0)

        Next.js (Vercel) ←── polls every 5s ───► API Gateway → Lambda — review_api → DynamoDB

GitHub Actions CI/CD
        └── Deploy Backend (Terraform → AWS)
        └── Show Vercel Deploy Info (environment variable instructions)

Vercel
        └── Auto-deploys Next.js on every push to master
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, React Query |
| Hosting | Vercel (automatic HTTPS, global CDN, auto-deploy on push) |
| LLM | OpenAI GPT-4o-mini (structured JSON output) |
| Queue | AWS SQS FIFO (review jobs + dead letter queue) |
| Compute | AWS Lambda (Python 3.11) — webhook handler, reviewer, review API |
| Database | AWS DynamoDB (PAY_PER_REQUEST) |
| API | AWS API Gateway (REST) |
| Observability | AWS CloudWatch Alarms (DLQ depth, API error rate) |
| Infrastructure as Code | Terraform (S3 remote state) |
| CI/CD | GitHub Actions (backend) + Vercel (frontend) |

---

## Project Structure

```
ai-code-review-platform/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD — builds OpenAI layer + Terraform deploy
├── frontend/                       # Next.js 14 app
│   ├── app/
│   │   ├── components/
│   │   │   ├── FindingCard.tsx     # Individual finding with severity + remediation
│   │   │   ├── ReviewCard.tsx      # Review summary card with status badge
│   │   │   ├── SeverityBadge.tsx   # CRITICAL/HIGH/MEDIUM/LOW colored badge
│   │   │   └── StatusBadge.tsx     # PENDING/PROCESSING/COMPLETED/FAILED badge
│   │   ├── reviews/
│   │   │   ├── page.tsx            # All reviews list with 5s polling
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Review detail — findings, diff, state machine
│   │   ├── layout.tsx              # Nav + React Query provider
│   │   └── page.tsx                # Dashboard — stats + recent reviews
│   └── .env.production             # NEXT_PUBLIC_API_URL (set in Vercel)
├── lambda/
│   ├── webhook_handler.py          # Signature verify, dedup, PENDING record, SQS enqueue
│   ├── reviewer.py                 # Fetch diff, GPT-4o-mini, store results, GitHub comment
│   └── review_api.py               # REST handler — dashboard, reviews list, review detail
├── terraform/
│   ├── main.tf                     # DynamoDB, SQS FIFO + DLQ, Lambda x3, API Gateway, IAM, CloudWatch
│   ├── variables.tf                # Region, project name, OpenAI key, GitHub token, webhook secret
│   └── outputs.tf                  # API URL, webhook URL, queue URLs
├── .gitignore
└── README.md
```

---

## System Design Decisions

**Why SQS FIFO instead of direct Lambda invocation?**
GitHub webhooks have a 10-second timeout — if the reviewer Lambda called GPT-4o-mini synchronously the webhook would time out before getting a response. SQS decouples ingestion from processing: the webhook handler responds to GitHub in under 100ms, the reviewer Lambda processes the job asynchronously in 15-45 seconds.

**Why polling instead of WebSockets?**
Code reviews take 15-45 seconds — a duration where maintaining a persistent WebSocket connection adds infrastructure complexity without meaningful UX benefit. Polling every 5 seconds is imperceptible to the user and appropriate for this latency. WebSockets would be the right choice if review time dropped below 2 seconds.

**Why HMAC-SHA256 signature verification?**
Without signature verification, anyone who discovers the API Gateway URL can send fake webhook events and trigger spurious reviews. The HMAC signature uses a shared secret known only to GitHub and the webhook handler, making it cryptographically impossible to forge valid events.

**Why PR number + commit SHA as the deduplication key?**
GitHub sometimes sends duplicate webhook events for the same action. Using just the PR number would prevent reviewing new commits pushed to an open PR. Using just the commit SHA would allow duplicates if GitHub retries a failed delivery. The combination is the minimal unique identifier for a specific state of a specific PR.

**Why a dead letter queue?**
Silent failures are worse than visible failures. If the reviewer Lambda fails — due to an OpenAI timeout, rate limit, or unexpected error — the job retries up to 3 times automatically. After 3 failures the message goes to the DLQ and a CloudWatch alarm fires immediately, making the failure visible rather than silently dropping the review.

---

## API Reference

### POST /webhook
Receives GitHub webhook events. Verifies HMAC-SHA256 signature, deduplicates, creates PENDING review, enqueues to SQS.

### GET /dashboard
Returns aggregate stats — total reviews, completed, failed, pending, average score, and 5 most recent reviews.

### GET /reviews
Returns all reviews ordered by most recent with status, score, and finding counts.

### GET /reviews/{review_id}
Returns full review detail — all findings by category, diff snippet, state machine timestamps, error message if failed.

---

## How to Deploy

### Prerequisites
- AWS account with CLI configured
- Terraform installed
- Node.js 20+ installed
- Vercel account and CLI (`npm install -g vercel`)
- OpenAI API key with credits
- GitHub Personal Access Token (classic, `repo` scope)

### Steps

**1. Create Terraform state bucket**
```bash
aws s3 mb s3://acr-tfstate-ahnaf --region us-east-1
```

**2. Update bucket name in terraform/main.tf**

**3. Create GitHub repo and add secrets**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `OPENAI_API_KEY`
- `GITHUB_TOKEN_SECRET` — GitHub PAT with repo scope
- `WEBHOOK_SECRET` — any string e.g. `acr-webhook-secret-2026`

**4. Initialize Terraform**
```bash
cd terraform && terraform init && cd ..
```

**5. Create terraform/terraform.tfvars (gitignored)**
```hcl
openai_api_key = "sk-your-key"
github_token   = "ghp-your-token"
webhook_secret = "acr-webhook-secret-2026"
```

**6. Push to GitHub — CI/CD deploys the backend**
```bash
git add . && git commit -m "Initial commit" && git push origin master
```

**7. Deploy frontend to Vercel**
```bash
cd frontend && vercel --prod
```

**8. Add environment variable in Vercel**
Settings → Environment Variables → `NEXT_PUBLIC_API_URL` = your API Gateway URL from GitHub Actions output

**9. Set up GitHub webhook on any repo**
- Payload URL: `YOUR_API_GATEWAY_URL/prod/webhook`
- Content type: `application/json`
- Secret: your webhook secret
- Events: Pull requests only

**10. Open a PR to trigger your first review**

---

## Screenshots

**Dashboard — 4 reviews across multiple repos, 72.5 average score:**

<img width="1197" height="665" alt="Dashboard" src="https://github.com/user-attachments/assets/14bb5241-7892-49f2-a3ec-c434b1bf8d08" />

**Review detail — Security findings with severity badges and remediation advice:**

<img width="1229" height="792" alt="Review page" src="https://github.com/user-attachments/assets/eca6114d-13b9-43db-b6ac-3d97be9cd81c" />

**GitHub PR — AI review comment posted automatically with score and findings table:**

<img width="720" height="919" alt="Github PR" src="https://github.com/user-attachments/assets/1834f82f-d1dc-4536-9776-e4a267e4e847" />

**GitHub Actions — backend deploy pipeline green:**

<img width="627" height="208" alt="CICD" src="https://github.com/user-attachments/assets/90448a4a-4f17-41c6-82f4-99ccb0d3890f" />

---

## Key Concepts Demonstrated

- **Webhook signature verification** — HMAC-SHA256 validation on every incoming GitHub event preventing unauthorized requests
- **Idempotent event processing** — PR number + commit SHA deduplication key ensures duplicate webhook deliveries are safely dropped
- **Async job queue** — SQS FIFO decouples fast webhook ingestion from slow LLM processing, with message group ID ensuring per-repo ordering
- **Review state machine** — explicit PENDING → PROCESSING → COMPLETED / FAILED transitions with timestamps stored in DynamoDB
- **Dead letter queue** — failed jobs after 3 retries routed to DLQ with CloudWatch alarm for immediate visibility
- **Structured LLM output** — GPT-4o-mini prompted with JSON schema and `response_format: json_object` ensuring parseable structured feedback
- **GitHub API integration** — reviewer Lambda posts formatted markdown comments directly to PRs using GitHub REST API
- **Real-time polling** — React Query polls every 5 seconds with conditional interval — stops polling once review reaches terminal state
- **CI/CD split deployment** — GitHub Actions owns Terraform backend, Vercel owns Next.js frontend with automatic redeploy on every push
- **Infrastructure as code** — all AWS resources provisioned via Terraform with S3 remote state shared between local and CI/CD
