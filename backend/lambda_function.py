import boto3
import json
import os
from datetime import datetime

rekognition = boto3.client('rekognition')
dynamodb = boto3.client('dynamodb')

def lambda_handler(event, context):
    print("Event:", json.dumps(event))

    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']

    # Search the face in Rekognition collection
    response = rekognition.search_faces_by_image(
        CollectionId='attendance-collection',
        Image={'S3Object': {'Bucket': bucket, 'Name': key}},
        FaceMatchThreshold=95,
        MaxFaces=1
    )

    if not response['FaceMatches']:
        print("No matching face found.")
        return {'statusCode': 404, 'body': 'Face not recognized'}

    face_id = response['FaceMatches'][0]['Face']['ExternalImageId']

    # Mark attendance in DynamoDB
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dynamodb.put_item(
        TableName='Attendance',
        Item={
            'EmployeeID': {'S': face_id},
            'Timestamp': {'S': now}
        }
    )

    print(f"Attendance marked for {face_id} at {now}")
    return {
        'statusCode': 200,
        'body': f"Attendance marked for {face_id} at {now}"
    }
