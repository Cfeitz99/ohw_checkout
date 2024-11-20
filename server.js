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
const ohwBaseUrl = 'https://ohwcheckout.taxmate.nl';

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

// Endpoint to create OHW Mollie payment
app.get('/create-ohw-payment', async (req, res) => {
  const contactId = req.query.contact_id;
  const companyId = req.query.company_id;
  const productIds = req.query.product_ids?.split(',') || []; // Accept product IDs as a comma-separated list

  try {
    if (!contactId && !companyId) {
      throw new Error('No contact ID or company ID provided');
    }

    if (productIds.length === 0) {
      throw new Error('No product IDs provided');
    }

    console.log(`Received request with contact_id: ${contactId}, company_id: ${companyId}, product_ids: ${productIds}`);

    // Get the access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return res.status(500).send('Failed to authenticate with FastAPI service');
    }

    // Construct the URL for the API call
    const queryParams = new URLSearchParams({
      ...(contactId && { contact_id: contactId }),
      ...(companyId && { company_id: companyId }),
    }).toString();

    const fastApiUrl = `${ohwBaseUrl}/mollie/generate/url/ohw?${queryParams}`;

    console.log(`Making POST request to FastAPI URL: ${fastApiUrl}`);

    // Make the POST request with the product IDs as payload
    const response = await axios.post(
      fastApiUrl,
      productIds, // Payload containing product IDs
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 200 && response.data && response.data.payment_url) {
      const checkoutUrl = response.data.payment_url;
      console.log(`Received Mollie payment URL: ${checkoutUrl}`);

      // Redirect the user to the Mollie payment URL
      return res.redirect(checkoutUrl);
    } else {
      console.error('Unexpected response from FastAPI service:', response.status, response.data);
      return res.status(500).send('Error generating payment URL');
    }
  } catch (error) {
    console.error('Error in /create-ohw-payment:', error.message);
    return res.status(500).send(`Error creating payment: ${error.message}`);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
