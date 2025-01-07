require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { Issuer, generators } = require('openid-client');

const app = express();
const PORT = process.env.PORT || 3000;

let client;

// Configure middleware
app.use(express.static('public')); // For serving static files
app.use(cors({ origin: 'http://localhost:3000', credentials: true })); // CORS
app.use(session({
    secret: 'your-session-secret', // Use a strong, random value in production
    resave: false,
    saveUninitialized: false,
}));

// Set view engine to EJS
app.set('view engine', 'ejs');

// Route for dice roller page
app.get('/dice', (req,res) => {
    res.render('dice');
});

// Initialize OpenID Client
async function initializeClient() {
    try {
        const issuer = await Issuer.discover(process.env.ISSUER);
        client = new issuer.Client({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uris: [process.env.REDIRECT_URI],
            response_types: ['code'],
        });
        console.log('OpenID client initialized');
    } catch (err) {
        console.error('Error initializing OpenID client:', err);
    }
}
initializeClient();

// Middleware to check authentication
const checkAuth = (req, res, next) => {
    req.isAuthenticated = req.session.userInfo ? true : false;
    next();
};

// Home route
app.get('/', checkAuth, (req, res) => {
    res.render('home', {
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo,
    });
});

// Login route
app.get('/login', (req, res) => {
    console.log("Calling /login")
    try {
        const nonce = generators.nonce();
        const state = generators.state();

        req.session.nonce = nonce;
        req.session.state = state;

        const authUrl = client.authorizationUrl({
            scope: 'email openid phone',
            state: state,
            nonce: nonce,
        });

        console.log('Redirecting to:', authUrl);
        res.redirect(authUrl);
    } catch (err) {
        console.error('Login error:', err);
        res.redirect('/');
    }
});

// Game Entry route
app.get('/gameEntry', checkAuth, (req, res) => {
    console.log("Calling /gameEntry")
    console.log(req.session.accessToken)
    const token = req.session.accessToken
    // if (!req.isAuthenticated) {
    //     console.log('User not authenticated. Redirecting to login.');
    //     return res.redirect('/nextScene');
    // }

    // res.render('gameEntry', { userInfo: req.session.userInfo });
    if (!token) {
        console.log('No token provided. Redirecting to login.');
        return res.redirect('/login');
    }

    res.render('gameEntry', { token });
});


// next Scene
app.get('/nextScene', checkAuth, (req, res) => {
    console.log("Calling /nextScene")
    const token=req.query.token
    // if (!req.isAuthenticated) {
    //     console.log('User not authenticated. Redirecting to login.');
    //     return res.redirect('/login');
    // }

    // res.render('nextScene', { userInfo: req.session.userInfo });
    if (!token) {
        console.log('No token provided. Redirecting to login.');
        return res.redirect('/login');
    }

    res.render('nextScene', { token });

});


// Callback route
app.get('/callback', async (req, res) => {
    console.log("calling /callback")
    try {
        const params = client.callbackParams(req);

        const tokenSet = await client.callback(
            process.env.REDIRECT_URI, // Must match Cognito configuration
            params,
            {
                nonce: req.session.nonce,
                state: req.session.state,
            }
        );

        const userInfo = await client.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;
        
        req.session.accessToken=tokenSet.access_token
        console.log('User successfully authenticated:', userInfo);
        res.redirect('/gameEntry');
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    console.log("Calling /logout")
    try {
        req.session.destroy();
        const logoutUrl = `${process.env.ISSUER_DOMAIN}/logout?client_id=${process.env.CLIENT_ID}&logout_uri=${process.env.LOGOUT_URI}`;
        console.log('Redirecting to Cognito Logout:', logoutUrl);
        res.redirect(logoutUrl);
    } catch (err) {
        console.error('Logout error:', err);
        res.redirect('/');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
