const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Get environment variables from Railway
const oauthUsername = process.env.OAUTH_USERNAME;
const oauthPassword = process.env.OAUTH_PASSWORD;
const tokenUrl = process.env.TOKEN_URL;
const fastApiBaseUrl = 'https://sunny-picture-production.up.railway.app';

// Function to get an OAuth token
async function getAccessToken() {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const payload = new URLSearchParams({
    username: oauthUsername,
    password: oauthPassword,
    grant_type: 'password',
  });

  try {
    const response = await axios.post(tokenUrl, payload, { headers });
    console.log('Access token response:', response.data);
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.message);
    return null;
  }
}

// Serve the static HTML file for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the static HTML file for the waiting page
app.get('/waiting-for-payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'waiting-for-payment.html'));
});

// Endpoint to create a Mollie payment
app.get('/create-payment', async (req, res) => {
  const contactId = req.query.contact_id;
  const companyId = req.query.company_id;

  try {
    if (!contactId && !companyId) {
      throw new Error('No contact ID or company ID provided');
    }

    console.log(`Received request with contact_id: ${contactId}, company_id: ${companyId}`);

    // Get the access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return res.status(500).send('Failed to authenticate with FastAPI service');
    }

    const idParam = contactId ? `contact_id=${contactId}` : `company_id=${companyId}`;
    const fastApiUrl = `${fastApiBaseUrl}/mollie/generate-payment-url?${idParam}`;

    console.log(`Making request to FastAPI URL: ${fastApiUrl}`);

    // Make the request without following redirects
    const response = await axios.get(fastApiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      maxRedirects: 0, // Do not follow redirects automatically
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept status codes from 200 to 399
      },
    });

    if (response.status === 302 || response.status === 307) {
      const checkoutUrl = response.headers.location;
      console.log(`Received redirect to Mollie payment URL: ${checkoutUrl}`);

      // Redirect the user to the Mollie payment URL
      return res.redirect(checkoutUrl);
    } else {
      console.error('Unexpected response from FastAPI service:', response.status);
      return res.status(500).send('Error generating payment URL');
    }
  } catch (error) {
    console.error('Error in /create-payment:', error.message);
    return res.status(500).send(`Error creating payment: ${error.message}`);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
