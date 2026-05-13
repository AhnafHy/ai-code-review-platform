import boto3
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone
from openai import OpenAI

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')

client = OpenAI(api_key=OPENAI_API_KEY)

REVIEW_PROMPT = """You are an expert code reviewer. Analyze the following pull request diff and provide structured feedback.

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "2-3 sentence overall assessment",
  "overall_score": 85,
  "security": [
    {
      "severity": "HIGH",
      "title": "Issue title",
      "description": "What the issue is",
      "suggestion": "How to fix it",
      "line_reference": "Optional line reference"
    }
  ],
  "performance": [
    {
      "severity": "MEDIUM",
      "title": "Issue title", 
      "description": "What the issue is",
      "suggestion": "How to fix it",
      "line_reference": "Optional line reference"
    }
  ],
  "quality": [
    {
      "severity": "LOW",
      "title": "Issue title",
      "description": "What the issue is", 
      "suggestion": "How to fix it",
      "line_reference": "Optional line reference"
    }
  ],
  "positives": ["What was done well", "Another positive"]
}

Severity levels: CRITICAL, HIGH, MEDIUM, LOW
Return empty arrays if no issues found in a category.
Return ONLY the JSON object, no markdown, no explanation."""

def get_pr_diff(diff_url):
    try:
        req = urllib.request.Request(
            diff_url,
            headers={
                'Authorization': f'token {GITHUB_TOKEN}',
                'Accept': 'application/vnd.github.v3.diff',
                'User-Agent': 'ai-code-review-platform'
            }
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            diff = response.read().decode('utf-8')
            return diff[:15000]  # Limit to 15k chars for token control
    except Exception as e:
        print(f"Failed to fetch diff: {e}")
        return None

def post_github_comment(repo, pr_number, review_data, review_id):
    try:
        security_count = len(review_data.get('security', []))
        performance_count = len(review_data.get('performance', []))
        quality_count = len(review_data.get('quality', []))
        score = review_data.get('overall_score', 0)
        
        def severity_emoji(s):
            return {'CRITICAL': '🔴', 'HIGH': '🟠', 'MEDIUM': '🟡', 'LOW': '🔵'}.get(s, '⚪')
        
        comment = f"""## 🤖 AI Code Review

**Overall Score: {score}/100**

{review_data.get('summary', '')}

---

### 📊 Summary
| Category | Issues Found |
|---|---|
| 🔒 Security | {security_count} |
| ⚡ Performance | {performance_count} |
| ✨ Quality | {quality_count} |

"""
        if review_data.get('security'):
            comment += "### 🔒 Security\n"
            for item in review_data['security']:
                comment += f"**{severity_emoji(item['severity'])} {item['severity']} — {item['title']}**\n"
                comment += f"{item['description']}\n"
                comment += f"💡 *{item['suggestion']}*\n\n"

        if review_data.get('performance'):
            comment += "### ⚡ Performance\n"
            for item in review_data['performance']:
                comment += f"**{severity_emoji(item['severity'])} {item['severity']} — {item['title']}**\n"
                comment += f"{item['description']}\n"
                comment += f"💡 *{item['suggestion']}*\n\n"

        if review_data.get('quality'):
            comment += "### ✨ Code Quality\n"
            for item in review_data['quality']:
                comment += f"**{severity_emoji(item['severity'])} {item['severity']} — {item['title']}**\n"
                comment += f"{item['description']}\n"
                comment += f"💡 *{item['suggestion']}*\n\n"

        if review_data.get('positives'):
            comment += "### ✅ What's Good\n"
            for positive in review_data['positives']:
                comment += f"- {positive}\n"

        comment += f"\n---\n*Review ID: `{review_id}` · [View full review](https://ai-code-review-platform-peach.vercel.app/reviews/{review_id})*"

        url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
        data = json.dumps({'body': comment}).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                'Authorization': f'token {GITHUB_TOKEN}',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'ai-code-review-platform'
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            print(f"Posted GitHub comment: {response.status}")
    except Exception as e:
        print(f"Failed to post GitHub comment: {e}")

def update_review_status(table, review_id, status, review_data=None, error=None):
    update_expr = "SET #s = :s, updated_at = :u"
    expr_names = {'#s': 'status'}
    expr_values = {
        ':s': status,
        ':u': datetime.now(timezone.utc).isoformat()
    }
    
    if review_data:
        update_expr += ", summary = :sum, overall_score = :score, security_findings = :sec, performance_findings = :perf, quality_findings = :qual, positives = :pos, completed_at = :c"
        expr_values.update({
            ':sum': review_data.get('summary', ''),
            ':score': review_data.get('overall_score', 0),
            ':sec': json.dumps(review_data.get('security', [])),
            ':perf': json.dumps(review_data.get('performance', [])),
            ':qual': json.dumps(review_data.get('quality', [])),
            ':pos': json.dumps(review_data.get('positives', [])),
            ':c': datetime.now(timezone.utc).isoformat()
        })
    
    if error:
        update_expr += ", error_message = :e"
        expr_values[':e'] = str(error)
    
    table.update_item(
        Key={'pk': f"REVIEW#{review_id}", 'sk': 'METADATA'},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values
    )

def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)
    
    for record in event.get('Records', []):
        body = json.loads(record['body'])
        review_id = body['review_id']
        repo = body['repo']
        pr_number = body['pr_number']
        diff_url = body['diff_url']
        
        print(f"Processing review {review_id}")
        
        # Transition to PROCESSING
        update_review_status(table, review_id, 'PROCESSING')
        
        try:
            # Fetch PR diff
            diff = get_pr_diff(diff_url)
            if not diff:
                raise Exception("Could not fetch PR diff")
            
            # Call GPT-4o-mini
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": REVIEW_PROMPT},
                    {"role": "user", "content": f"PR: {body.get('pr_title', '')}\n\nDiff:\n{diff}"}
                ],
                max_tokens=2000,
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            raw_response = completion.choices[0].message.content
            review_data = json.loads(raw_response)
            
            # Store diff snippet
            table.update_item(
                Key={'pk': f"REVIEW#{review_id}", 'sk': 'METADATA'},
                UpdateExpression="SET diff_snippet = :d",
                ExpressionAttributeValues={':d': diff[:3000]}
            )
            
            # Transition to COMPLETED
            update_review_status(table, review_id, 'COMPLETED', review_data)
            
            # Post comment to GitHub PR
            post_github_comment(repo, pr_number, review_data, review_id)
            
            print(f"Review {review_id} completed — score: {review_data.get('overall_score')}")
            
        except Exception as e:
            print(f"Review {review_id} failed: {e}")
            update_review_status(table, review_id, 'FAILED', error=str(e))
            raise  # Re-raise so SQS sends to DLQ