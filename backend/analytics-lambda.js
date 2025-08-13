const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.handler = async () => {
  const tableName = process.env.DYNAMODB_TABLE || "AttendanceLogs-prod";
  const bucketName = process.env.ANALYTICS_BUCKET || "attendance-system-backend-prod";

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const weekAgo = new Date();
  weekAgo.setDate(now.getDate() - 7);
  
  // DynamoDB scan params (adjust if you have Timestamp filter or indexes)
  const params = { TableName: tableName };

  let items = [];
  let data;
  do {
    data = await dynamodb.scan(params).promise();
    items = items.concat(data.Items);
    params.ExclusiveStartKey = data.LastEvaluatedKey;
  } while (typeof data.LastEvaluatedKey !== "undefined");

  const dailyCounts = {};
  const weeklyCounts = {};

  items.forEach(item => {
    const dateOnly = item.Timestamp.split('T')[0];
    if (dateOnly === today) {
      dailyCounts[item.EmployeeID] = (dailyCounts[item.EmployeeID] || 0) + 1;
    }
    if (new Date(dateOnly) >= weekAgo) {
      weeklyCounts[item.EmployeeID] = (weeklyCounts[item.EmployeeID] || 0) + 1;
    }
  });

  await s3.putObject({
    Bucket: bucketName,
    Key: 'analytics/daily.json',
    Body: JSON.stringify(dailyCounts, null, 2),
    ContentType: 'application/json'
  }).promise();

  await s3.putObject({
    Bucket: bucketName,
    Key: 'analytics/weekly.json',
    Body: JSON.stringify(weeklyCounts, null, 2),
    ContentType: 'application/json'
  }).promise();

  return { dailyCounts, weeklyCounts };
};
