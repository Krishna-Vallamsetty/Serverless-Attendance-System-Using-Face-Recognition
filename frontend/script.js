// == COGNITO CONFIG ==
const userPoolId = 'ap-south-1_d0DeRa0Ae';
const clientId = '712f4fa1bfut5fmd1qsn7jfek2';
const presignApiUrl = 'https://2utt4ut6mg.execute-api.ap-south-1.amazonaws.com/prod/getUploadUrl';
const attendanceApiUrl = 'https://2utt4ut6mg.execute-api.ap-south-1.amazonaws.com/prod/mark-attendance';

// == DOM ELEMENTS ==
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const photo = document.getElementById('photo');
const captureBtn = document.getElementById('capture');
const retakeBtn = document.getElementById('retake');
const uploadBtn = document.getElementById('upload');
const statusDiv = document.getElementById('status');
const spinner = document.getElementById('spinner');
const loginBtn = document.getElementById('login-btn'); // Optional: explicit login button
const context = canvas.getContext('2d');

let idToken = null;

// == HELPER: Set Status with fade ==
function setStatus(text, type = '') {
  statusDiv.textContent = text;
  statusDiv.className = '';
  if (type) statusDiv.classList.add(type);
  if (text) {
    statusDiv.classList.add('visible');
  } else {
    statusDiv.classList.remove('visible');
  }
}

// == Show or hide spinner ==
function showSpinner(show) {
  spinner.hidden = !show;
}

// == Reset UI to initial state ==
function resetUI() {
  photo.hidden = true;
  video.hidden = false;
  captureBtn.hidden = false;
  retakeBtn.hidden = true;
  uploadBtn.hidden = true;
  setStatus('');
}

// == LOGIN FUNCTION ==
function loginCognito() {
  const username = prompt("Enter Username:");
  const password = prompt("Enter Password:");
  if (!username || !password) {
    setStatus("Login cancelled.", "warning");
    return;
  }
  const poolData = { UserPoolId: userPoolId, ClientId: clientId };
  const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
  const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: username,
    Password: password
  });
  const userData = { Username: username, Pool: userPool };
  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (result) => {
      idToken = result.getIdToken().getJwtToken();
      setStatus("Login successful! You can now capture your photo.", "success");
      startCamera();
    },
    onFailure: (err) => {
      console.error("Cognito login failed:", err);
      setStatus("Login failed: " + err.message, "error");
    }
  });
}

// == START CAMERA ==
function startCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
        video.hidden = false;
      })
      .catch(err => {
        console.error("Webcam error:", err);
        setStatus("Error accessing webcam: " + err.message, "error");
        video.hidden = true;
      });
  } else {
    setStatus("Webcam not supported in this browser.", "error");
    video.hidden = true;
  }
}

// == CAPTURE PHOTO ==
captureBtn.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataURL = canvas.toDataURL('image/png');
  photo.src = dataURL;
  photo.hidden = false;
  video.hidden = true;
  captureBtn.hidden = true;
  retakeBtn.hidden = false;
  uploadBtn.hidden = false;
  setStatus('');
});

// == RETAKE PHOTO ==
retakeBtn.addEventListener('click', () => {
  resetUI();
});

// == UPLOAD PHOTO ==
uploadBtn.addEventListener('click', async () => {
  if (!idToken) {
    setStatus("⚠️ Please log in first!", "warning");
    return;
  }
  setStatus("Uploading...", "warning");
  showSpinner(true);
  uploadBtn.disabled = true;
  retakeBtn.disabled = true;
  function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
  }
  try {
    const blob = dataURLtoBlob(canvas.toDataURL('image/png'));
    const filename = `attendance_${Date.now()}.png`;
    // Get presigned URL
    const presignResponse = await fetch(`${presignApiUrl}?filename=${encodeURIComponent(filename)}&filetype=image/png`, {
      headers: { Authorization: idToken }
    });
    if (!presignResponse.ok) throw new Error('Failed to get presigned URL');
    const { uploadUrl, key } = await presignResponse.json();
    // Upload to S3
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'image/png' }
    });
    if (!uploadResponse.ok) throw new Error('Failed to upload image to S3');
    // Call attendance API
    const attendanceResponse = await fetch(attendanceApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: idToken
      },
      body: JSON.stringify({ imageKey: key })
    });
    const attendanceResult = await attendanceResponse.json();

    // Token expiration check: If Unauthorized, prompt login
    if (attendanceResponse.status === 401) {
      setStatus("Session expired, please log in again.", "warning");
      idToken = null;
      resetUI();
      return;
    }

    if (attendanceResult.message?.includes('already marked')) {
      setStatus(attendanceResult.message, "warning");
    } else if (attendanceResult.message?.includes('Attendance marked successfully')) {
      setStatus(attendanceResult.message + " " + (attendanceResult.employeeId || ""), "success");
      resetUI();
    } else if (attendanceResult.message?.includes('cannot mark attendance more than')) {
      setStatus(attendanceResult.message, "warning");
    } else if (attendanceResult.error) {
      setStatus(`Error: ${attendanceResult.error}`, "error");
      console.error("Attendance API error:", attendanceResult);
    } else {
      setStatus('Unexpected response from attendance API', "warning");
      console.warn("Unexpected API response:", attendanceResult);
    }
  } catch (error) {
    console.error('Upload error:', error);
    setStatus('Error: ' + error.message, "error");
  } finally {
    uploadBtn.disabled = false;
    retakeBtn.disabled = false;
    showSpinner(false);
  }
});

// == OPTIONAL: Bind explicit login button click (remove auto login on page load) ==
if (loginBtn) {
  loginBtn.addEventListener('click', loginCognito);
} else {
  // If no login button is in the UI, initiate login immediately:
  loginCognito();
}

// == INITIALIZE UI ==
setStatus("Please login to start.", "warning");
resetUI();
