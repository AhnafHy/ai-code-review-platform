import boto3
import json
import os
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE', '')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def get_all_reviews(table):
    result = table.scan(
        FilterExpression=Attr('sk').eq('METADATA') & Attr('pk').begins_with('REVIEW#')
    )
    reviews = sorted(
        [i for i in result.get('Items', []) if not i['pk'].startswith('REVIEW#DEDUP')],
        key=lambda x: x.get('created_at', ''),
        reverse=True
    )
    return [{
        'review_id': r['review_id'],
        'status': r['status'],
        'repo': r['repo'],
        'pr_number': int(r['pr_number']),
        'pr_title': r.get('pr_title', ''),
        'pr_url': r.get('pr_url', ''),
        'author': r.get('author', ''),
        'overall_score': int(r.get('overall_score', 0)),
        'created_at': r.get('created_at', ''),
        'completed_at': r.get('completed_at', ''),
        'security_count': len(json.loads(r.get('security_findings', '[]'))),
        'performance_count': len(json.loads(r.get('performance_findings', '[]'))),
        'quality_count': len(json.loads(r.get('quality_findings', '[]')))
    } for r in reviews]

def get_review_detail(table, review_id):
    result = table.get_item(
        Key={'pk': f"REVIEW#{review_id}", 'sk': 'METADATA'}
    )
    item = result.get('Item')
    if not item:
        return None
    
    return {
        'review_id': item['review_id'],
        'status': item['status'],
        'repo': item['repo'],
        'pr_number': int(item['pr_number']),
        'pr_title': item.get('pr_title', ''),
        'pr_url': item.get('pr_url', ''),
        'author': item.get('author', ''),
        'commit_sha': item.get('commit_sha', ''),
        'base_branch': item.get('base_branch', ''),
        'head_branch': item.get('head_branch', ''),
        'overall_score': int(item.get('overall_score', 0)),
        'summary': item.get('summary', ''),
        'security': json.loads(item.get('security_findings', '[]')),
        'performance': json.loads(item.get('performance_findings', '[]')),
        'quality': json.loads(item.get('quality_findings', '[]')),
        'positives': json.loads(item.get('positives', '[]')),
        'diff_snippet': item.get('diff_snippet', ''),
        'error_message': item.get('error_message', ''),
        'created_at': item.get('created_at', ''),
        'updated_at': item.get('updated_at', ''),
        'completed_at': item.get('completed_at', '')
    }

def get_dashboard_stats(table):
    result = table.scan(
        FilterExpression=Attr('sk').eq('METADATA') & Attr('pk').begins_with('REVIEW#')
    )
    reviews = [i for i in result.get('Items', [])
               if not i['pk'].startswith('REVIEW#DEDUP')]
    
    if not reviews:
        return {
            'total_reviews': 0,
            'completed': 0,
            'failed': 0,
            'pending': 0,
            'avg_score': 0,
            'recent_reviews': []
        }
    
    completed = [r for r in reviews if r['status'] == 'COMPLETED']
    avg_score = sum(int(r.get('overall_score', 0)) for r in completed) / len(completed) if completed else 0
    
    recent = sorted(reviews, key=lambda x: x.get('created_at', ''), reverse=True)[:5]
    
    return {
        'total_reviews': len(reviews),
        'completed': len(completed),
        'failed': len([r for r in reviews if r['status'] == 'FAILED']),
        'pending': len([r for r in reviews if r['status'] in ['PENDING', 'PROCESSING']]),
        'avg_score': round(avg_score, 1),
        'recent_reviews': [{
            'review_id': r['review_id'],
            'status': r['status'],
            'repo': r['repo'],
            'pr_number': int(r['pr_number']),
            'pr_title': r.get('pr_title', ''),
            'overall_score': int(r.get('overall_score', 0)),
            'created_at': r.get('created_at', '')
        } for r in recent]
    }

def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return response(200, {})
    
    table = dynamodb.Table(TABLE_NAME)
    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')
    
    if method == 'GET' and path == '/health':
        return response(200, {'status': 'ok'})
    
    elif method == 'GET' and path == '/dashboard':
        return response(200, get_dashboard_stats(table))
    
    elif method == 'GET' and path == '/reviews':
        return response(200, get_all_reviews(table))
    
    elif method == 'GET' and '/reviews/' in path:
        review_id = path.split('/reviews/')[-1]
        detail = get_review_detail(table, review_id)
        if not detail:
            return response(404, {'error': 'Review not found'})
        return response(200, detail)
    
    elif method == 'POST' and path == '/webhook':
        # Forward to webhook handler
        lambda_client = boto3.client('lambda')
        webhook_function = os.environ.get('WEBHOOK_FUNCTION', '')
        result = lambda_client.invoke(
            FunctionName=webhook_function,
            InvocationType='RequestResponse',
            Payload=json.dumps(event).encode()
        )
        payload = json.loads(result['Payload'].read())
        return payload
    
    return response(404, {'error': 'Endpoint not found'})