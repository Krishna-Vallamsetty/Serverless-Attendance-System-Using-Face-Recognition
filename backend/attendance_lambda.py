import json
import boto3
from datetime import datetime

def lambda_handler(event, context):
    print("Event received:", json.dumps(event))  # Debug incoming event

    rekognition = boto3.client('rekognition')
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('AttendanceLogs-prod')

    bucket = event['Records'][0]['s3']['bucket']['name']
    photo = event['Records'][0]['s3']['object']['key']
    print(f"Processing image: {photo} from bucket: {bucket}")  # Debug file

    try:
        response = rekognition.search_faces_by_image(
            CollectionId='face-collection-prod',
            Image={'S3Object': {'Bucket': bucket, 'Name': photo}},
            FaceMatchThreshold=90,
            MaxFaces=1
        )

        print("Rekognition response:", response)  # Debug Rekognition result

        if response['FaceMatches']:
            emp_id = response['FaceMatches'][0]['Face']['ExternalImageId']
            timestamp = datetime.now().isoformat()

            table.put_item(Item={
                'EmployeeID': emp_id,
                'Timestamp': timestamp
            })

            print(f"Attendance recorded for {emp_id} at {timestamp}")
            return {
                'statusCode': 200,
                'body': json.dumps(f"Attendance marked for {emp_id} at {timestamp}")
            }
        else:
            print("No face match found.")
            return {
                'statusCode': 404,
                'body': json.dumps("Face not recognized")
            }

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"Error: {str(e)}")
        }
