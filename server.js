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

app.get('/create-ohw-payment', async (req, res) => {
    const contactId = req.query.contact_id;
    const companyId = req.query.company_id;
    const productIds = req.query.product_ids;

    try {
        if (!contactId && !companyId) {
            throw new Error('No contact ID or company ID provided');
        }
        if (!productIds) {
            throw new Error('No product IDs provided');
        }

        console.log(`Received request with contact_id: ${contactId}, company_id: ${companyId}, product_ids: ${productIds}`);

        // Get the access token
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return res.status(500).send('Failed to authenticate with FastAPI service');
        }

        const idParam = contactId ? `contact_id=${contactId}` : `company_id=${companyId}`;
        const fastApiUrl = `${fastApiBaseUrl}/mollie/generate/url/ohw?${idParam}`;
        const payload = productIds.split(',').map(id => id.trim()); // Convert product IDs into an array

        console.log(`Making request to FastAPI URL: ${fastApiUrl} with payload: ${JSON.stringify(payload)}`);

        // Make the request without following redirects
        const response = await axios.post(fastApiUrl, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 200 && response.data?.checkout_url) {
            const checkoutUrl = response.data.checkout_url;
            console.log(`Redirecting to Mollie payment URL: ${checkoutUrl}`);
            return res.redirect(checkoutUrl);
        } else {
            console.error('Unexpected response from FastAPI service:', response.status);
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
