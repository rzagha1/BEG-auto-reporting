const express = require('express')
const app = express()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const path = require('path')  // Add this line to import the path module
const queryRoutes = require('./routes/query')

// Essential middleware
app.use(express.json()) // Parse JSON payloads
app.use(cookieParser())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(
    cors({
        origin: '*',
    })
)

app.use((req, res, next) => {
    console.log('Request Cookies:', req.cookies)
    next()
})

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/healthcheck', (req, res) => {
    res.send('Server is up and running')
})

app.use('/api', queryRoutes); 

// Start the server
const PORT = process.env.PORT || 1000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})