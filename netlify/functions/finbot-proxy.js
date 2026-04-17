exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
  
    try {
      const { body, secret } = JSON.parse(event.body);
  
      const response = await fetch('https://api.finbotai.co.il/income', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'secret': secret
        },
        body: JSON.stringify(body)
      });
  
      const data = await response.json();
  
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.message })
      };
    }
  };
  