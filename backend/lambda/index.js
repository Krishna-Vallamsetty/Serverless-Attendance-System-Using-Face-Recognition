const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log("Incoming event:", JSON.stringify(event, null, 2));

  try {
    let body = event.body ? JSON.parse(event.body) : event;
    const { imageKey } = body;

    if (!imageKey) {
      return response(400, { message: "Missing required parameter: imageKey" });
    }

    const bucketName = process.env.BUCKET_NAME;
    const collectionId = process.env.COLLECTION_ID;
    const tableName = process.env.DYNAMODB_TABLE;

    console.log(`Processing imageKey: ${imageKey} from bucket: ${bucketName}`);

    const image = await s3.getObject({ Bucket: bucketName, Key: imageKey }).promise();
    console.log(`Image downloaded. Size: ${image.Body.length} bytes`);

    const searchResult = await rekognition.searchFacesByImage({
      CollectionId: collectionId,
      Image: { Bytes: image.Body },
      MaxFaces: 1,
      FaceMatchThreshold: 90
    }).promise();

    console.log("Rekognition result:", JSON.stringify(searchResult, null, 2));

    if (!searchResult.FaceMatches || searchResult.FaceMatches.length === 0) {
      return response(200, { message: "No matching face found" });
    }

    const match = searchResult.FaceMatches[0];
    const employeeId = match.Face.ExternalImageId || "Unknown";
    console.log(`Matched EmployeeID: ${employeeId}`);

    const today = new Date().toISOString().split("T")[0];
    const nowTimestamp = new Date().toISOString();
    const ATTENDANCE_LIMIT = 2;

    const queryParams = {
      TableName: tableName,
      KeyConditionExpression: "EmployeeID = :empId AND begins_with(#ts, :today)",
      ExpressionAttributeNames: { "#ts": "Timestamp" },
      ExpressionAttributeValues: {
        ":empId": employeeId,
        ":today": today
      }
    };

    const queryResult = await dynamodb.query(queryParams).promise();
    const attendanceCountToday = queryResult.Items.length;

    if (attendanceCountToday >= ATTENDANCE_LIMIT) {
      return response(400, {
        message: `You cannot mark attendance more than ${ATTENDANCE_LIMIT} times today.`
      });
    }

    await dynamodb.put({
      TableName: tableName,
      Item: { EmployeeID: employeeId, Timestamp: nowTimestamp }
    }).promise();

    console.log(`Attendance recorded for ${employeeId} at ${nowTimestamp}`);

    return response(200, {
      message: "Attendance marked successfully",
      employeeId,
      date: today,
      time: nowTimestamp
    });

  } catch (err) {
    console.error("Error processing attendance:", err);
    return response(500, { message: "Internal server error", error: err.message });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}
