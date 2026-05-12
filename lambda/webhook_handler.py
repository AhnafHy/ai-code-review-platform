import boto3
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

sqs = boto3.client('sqs', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
dynamodb = boto3.resource('dynamodb')

QUEUE_URL = os.environ.get('SQS_QUEUE_URL', '')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE', '')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')

def verify_signature(payload_body, signature_header):
    if not signature_header:
        return False
    expected = 'sha256=' + hmac.new(
        WEBHOOK_SECRET.encode('utf-8'),
        payload_body.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)

def is_duplicate(table, dedup_key):
    try:
        result = table.get_item(
            Key={'pk': f"DEDUP#{dedup_key}", 'sk': 'CHECK'}
        )
        return 'Item' in result
    except Exception:
        return False

def mark_processed(table, dedup_key):
    table.put_item(Item={
        'pk': f"DEDUP#{dedup_key}",
        'sk': 'CHECK',
        'processed_at': datetime.now(timezone.utc).isoformat(),
        'ttl': int(datetime.now(timezone.utc).timestamp()) + 86400
    })

def create_review_record(table, review_id, pr_data):
    table.put_item(Item={
        'pk': f"REVIEW#{review_id}",
        'sk': 'METADATA',
        'review_id': review_id,
        'status': 'PENDING',
        'repo': pr_data['repo'],
        'pr_number': pr_data['pr_number'],
        'pr_title': pr_data['pr_title'],
        'pr_url': pr_data['pr_url'],
        'commit_sha': pr_data['commit_sha'],
        'author': pr_data['author'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    })

def lambda_handler(event, context):
    headers = event.get('headers', {})
    body = event.get('body', '')
    
    # Normalize headers to lowercase
    headers = {k.lower(): v for k, v in headers.items()}
    
    # Verify webhook signature
    signature = headers.get('x-hub-signature-256', '')
    if WEBHOOK_SECRET and not verify_signature(body, signature):
        print("Invalid webhook signature")
        return {
            'statusCode': 401,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Invalid signature'})
        }
    
    event_type = headers.get('x-github-event', '')
    
    if event_type != 'pull_request':
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f'Ignoring event type: {event_type}'})
        }
    
    payload = json.loads(body)
    action = payload.get('action', '')
    
    # Trigger on opened or new commits pushed
    if action not in ['opened', 'synchronize']:
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f'Ignoring action: {action}'})
        }
    
    pr = payload.get('pull_request', {})
    repo = payload.get('repository', {})
    
    pr_number = pr.get('number')
    commit_sha = pr.get('head', {}).get('sha', '')[:8]
    repo_full_name = repo.get('full_name', '')
    
    # Idempotency check using PR number + commit SHA
    dedup_key = f"{repo_full_name}#{pr_number}#{commit_sha}"
    
    table = dynamodb.Table(TABLE_NAME)
    
    if is_duplicate(table, dedup_key):
        print(f"Duplicate event for {dedup_key} — skipping")
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Duplicate event — already processing'})
        }
    
    mark_processed(table, dedup_key)
    
    # Build review ID
    review_id = f"{repo_full_name.replace('/', '-')}-PR{pr_number}-{commit_sha}"
    
    pr_data = {
        'repo': repo_full_name,
        'pr_number': pr_number,
        'pr_title': pr.get('title', ''),
        'pr_url': pr.get('html_url', ''),
        'diff_url': pr.get('diff_url', ''),
        'commit_sha': commit_sha,
        'author': pr.get('user', {}).get('login', ''),
        'base_branch': pr.get('base', {}).get('ref', ''),
        'head_branch': pr.get('head', {}).get('ref', ''),
        'review_id': review_id
    }
    
    # Create review record in PENDING state
    create_review_record(table, review_id, pr_data)
    
    # Enqueue review job in SQS FIFO
    sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(pr_data),
        MessageGroupId=repo_full_name.replace('/', '-'),
        MessageDeduplicationId=dedup_key.replace('#', '-').replace('/', '-')
    )
    
    print(f"Enqueued review job for {review_id}")
    
    return {
        'statusCode': 202,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({
            'message': 'Review job enqueued',
            'review_id': review_id
        })
    }