const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const multer = require('multer');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); 


let arduinoData = { soil_moisture: null, temperature: null };
let arduinoInstruction = '';


const db = mysql.createConnection({
  host: '3.25.192.50', 
  user: 'root', 
  password: 'Password?!', 
  database: 'SmartPlantWatering', 
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1); 
  }
  console.log('Connected to the MySQL database.');
});

// Endpoint for Arduino to send data
app.post('/send-data', (req, res) => {
  const { soil_moisture, temperature } = req.body;
  arduinoData.soil_moisture = soil_moisture;
  arduinoData.temperature = temperature;
  console.log(
    `Received data from Arduino: Soil Moisture = ${soil_moisture}, Temperature = ${temperature}`
  );

  // Insert the data into the SensorReadings table
  const query =
    'INSERT INTO SensorReadings (soil_moisture, temperature) VALUES (?, ?)';
  db.query(query, [soil_moisture, temperature], (err, result) => {
    if (err) {
      console.error('Error inserting data into database:', err);
      return res.status(500).send('Database error');
    }
    io.emit('update-data', arduinoData); 
    res.sendStatus(200);
  });
});

// Endpoint for Arduino to fetch instructions
app.get('/get-instructions', (req, res) => {
  res.json({ instruction: arduinoInstruction });
  console.log(`Arduino fetched instruction: ${arduinoInstruction}`);
});

// Endpoint to get the location selected last time
app.get('/get-location', (req, res) => {
  const query = 'SELECT location FROM instructions WHERE id = 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching location:', err);
      return res.status(500).send('Database error');
    }
    const location = results[0]?.location || 'Unknown'; 
    res.json({ location });
  });
});

// Endpoint to post the location
app.post('/update-location', (req, res) => {
  const { location } = req.body; 

  const query = 'UPDATE instructions SET location = ? WHERE id = 1';
  db.query(query, [location], (err, result) => {
    if (err) {
      console.error('Error updating location:', err);
      return res.status(500).send('Database error');
    }
    console.log('Location updated to:', location);
    res.sendStatus(200);
  });
});



app.get('/get-shelter-status', (req, res) => {
  const query = 'SELECT shelter FROM instructions WHERE id = 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching shelter status:', err);
      return res.status(500).send('Database error');
    }
    const shelterStatus = results[0]?.shelter || false; 
    res.json({ shelter: shelterStatus });
  });
});

app.post('/shelter-instruction', (req, res) => {
  const { instruction } = req.body;

  if (instruction === 'Shelter on') {
    const query = 'UPDATE instructions SET shelter = 1 WHERE id = 1';
    db.query(query, (err, result) => {
      if (err) {
        console.error('Error updating shelter status:', err);
        return res.status(500).send('Database error');
      }
      console.log('Shelter turned ON');
      io.emit('shelter-status', true); 
      res.sendStatus(200);
    });
  } else if (instruction === 'Shelter off') {
    const query = 'UPDATE instructions SET shelter = 0 WHERE id = 1';
    db.query(query, (err, result) => {
      if (err) {
        console.error('Error updating shelter status:', err);
        return res.status(500).send('Database error');
      }
      console.log('Shelter turned OFF');
      io.emit('shelter-status', false);
      res.sendStatus(200);
    });
  } else {
    res.status(400).send('Invalid instruction');
  }
});

app.post('/pump-instruction', (req, res) => {
  const { instruction } = req.body;

  if (instruction === 'Pump a bit water') {
    const query = 'UPDATE instructions SET pump = 1 WHERE id = 1';
    db.query(query, (err, result) => {
      if (err) {
        console.error('Error updating pump status:', err);
        return res.status(500).send('Database error');
      }
      console.log('Pump signal on!');
      io.emit('pump-status', true);
    });

    res.sendStatus(200);
  } else {
    res.status(400).send('Invalid instruction');
  }
});

app.post('/pump-completed', (req, res) => {
  const { pump } = req.body;

  if (pump === 1) {
    const query = 'UPDATE instructions SET pump = 0 WHERE id = 1';
    db.query(query, (err, result) => {
      if (err) {
        console.error('Error updating pump status:', err);
        return res.status(500).send('Database error');
      }
      console.log('Pump flag updated to 0 (available).');
      io.emit('pump-status', false); 
      res.status(200).json({ message: 'Pump flag updated to 0 (available).' });
    });
  } else {
    res.status(400).json({ error: 'Invalid pump status in request.' });
  }
});

app.get('/get-pump-status', (req, res) => {
  const query = 'SELECT pump FROM instructions WHERE id = 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching pump status:', err);
      return res.status(500).send('Database error');
    }
    const pumpStatus = results[0]?.pump || 0; 
    res.json({ pump: pumpStatus });
  });
});


app.get('/get-all-sensor-data', (req, res) => {
  const query = 'SELECT * FROM SensorReadings ORDER BY timestamp ASC'; // Fetch all data ordered by timestamp
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching sensor data:', err);
      return res.status(500).send('Database error');
    }
    res.json(results);
  });
});


// Endpoint to update the moisture threshold
app.post('/update-threshold', (req, res) => {
  const { moisture_threshold } = req.body; // Extract threshold value from the request body

  if (!moisture_threshold || isNaN(moisture_threshold)) {
    return res.status(400).send('Invalid moisture threshold value.');
  }

  const query = 'UPDATE instructions SET moisture_threshold = ? WHERE id = 1';
  db.query(query, [moisture_threshold], (err, result) => {
    if (err) {
      console.error('Error updating moisture threshold:', err);
      return res.status(500).send('Database error');
    }
    console.log(`Moisture threshold updated to: ${moisture_threshold}`);
    res.sendStatus(200);
  });
});

/*app.get('/get-threshold', (req, res) => {
  const query = 'SELECT moisture_threshold FROM instructions WHERE id = 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching moisture threshold:', err);
      return res.status(500).send('Database error');
    }
    console.log("RES is", res);
    res.json({ moisture_threshold });
  });
});*/

app.get('/get-threshold', (req, res) => {
  const query = 'SELECT moisture_threshold FROM instructions WHERE id = 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching moisture threshold:', err);
      return res.status(500).send('Database error');
    }

    if (results && results.length > 0) {
      const moisture_threshold = results[0].moisture_threshold;
      res.json({ moisture_threshold });
    } else {
      console.error('No data found for the given query.');
      res.status(404).send('No threshold data found.');
    }
  });
});




app.post('/analyze-plant', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file.path;

    const imageBuffer = require('fs').readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const base64WithPrefix = `data:image/jpeg;base64,${base64Image}`; 

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'google/gemini-pro-vision',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: "text",
              text: `Analyze this plant image and follow these steps:
1. First determine if this plant belongs to any of these categories:
   - Cactus (threshold: 600)
   - Succulents (threshold: 600)
   - Snake Plant (threshold: 500)
   - Spider Plant (threshold: 450)
   - Peace Lily (threshold: 400)
   - Pothos (threshold: 400)
   - Fiddle Leaf Fig (threshold: 400)
   - Fern (threshold: 350)
   - Orchid (threshold: 400)
   - Bamboo Palm (threshold: 400)

2. Respond in this exact format:
   If the plant matches any from the list:
   "The plant is PLANT_NAME. The suggested threshold is THRESHOLD."
   (For example: "The plant is Snake Plant. The suggested threshold is 500.")
   
   If the plant doesn't match any from the list:
   "The plant is actual_plant_name . The suggested threshold is 430"
   (For example: "The plant is Sunflower. The suggested threshold is 430")

Please only provide the response in the specified format without any additional text.`
            },
            {
              type: "image_url",
              image_url: {
                url: base64WithPrefix
              }
            }
          ]
        }
      ]
    }, {
      headers: {
        'Authorization': 'I do not provide my key',
        'HTTP-Referer': 'http://3.25.192.50:3000/',
        'X-Title': 'Plant Analyzer',
        'Content-Type': 'application/json'
      }
    });

    const plantName = response.data.choices[0]?.message?.content || 'Unknown Plant';

    require('fs').unlinkSync(imagePath);

    res.json({ plant_name: plantName });
  } catch (error) {
    console.error('Error analyzing plant image:', error);
    res.status(500).json({ 
      error: 'Failed to analyze plant image',
      details: error.message 
    });
  }
});




// Real time update
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.emit('update-data', arduinoData); // Send the latest data to the user

  // Fetch and send the current shelter status
  db.query('SELECT shelter FROM instructions LIMIT 1', (err, results) => {
    if (err) {
      console.error('Error fetching shelter status:', err);
    } else {
      const shelterStatus = results[0]?.shelter || false;
      socket.emit('shelter-status', shelterStatus);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});


// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
