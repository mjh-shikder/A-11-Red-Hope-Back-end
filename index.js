const express = require('express');
const cors = require('cors')
require('dotenv').config({ path: '.env.local' });

const app = express();
const port = process.env.PORT || 5000;


// Middleware
app.use(cors());
app.use(express.json())
//

app.get('/', (req, res) => {
    res.send('Hello world')
})

app.listen(port, () => {
    console.log(`users server started on port: ${port}`);

})


