import boto3
import json
import os
from datetime import datetime

rekognition = boto3.client('rekognition')
dynamodb = boto3.client('dynamodb')

COLLECTION_ID = "employees_face_collection_f13"
TABLE_NAME = "Employees_F13_Attendance"

def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    employee_id = key.split('/')[0]  # Folder name is EmployeeID

    # Index face into Rekognition
    response = rekognition.index_faces(
        CollectionId=COLLECTION_ID,
        Image={'S3Object': {'Bucket': bucket, 'Name': key}},
        ExternalImageId=employee_id,
        DetectionAttributes=['ALL']
    )

    # Store metadata in DynamoDB
    dynamodb.put_item(
        TableName=TABLE_NAME,
        Item={
            'EmployeeID': {'S': employee_id},
            'ImageKey': {'S': key},
            'RegisteredAt': {'S': datetime.utcnow().isoformat()}
        }
    )

    return {
        'statusCode': 200,
        'body': json.dumps(f"Face registered successfully for {employee_id}")
    }
