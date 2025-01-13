const express = require('express')
const app = express()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const path = require('path')
const queryRoutes = require('./routes/query')
const QueryController = require('./controllers/queryController')  // Add this line
const queryController = new QueryController()  // Add this line

// Essential middleware
app.use(express.json())
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

app.use('/static', express.static(path.join(__dirname, 'public')));

// Serve the form at root
app.get('/', queryController.getFormData.bind(queryController));

// Routes
app.get('/healthcheck', (req, res) => {
    res.send('Server is up and running')
})

app.use('/api', queryRoutes); 

const PORT = process.env.PORT || 10000
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`)
})