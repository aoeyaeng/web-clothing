const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 3000;


const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false,
        ca: process.env.DB_CA_CERT
    }
});


(async () => {
    try {
        const conn = await pool.getConnection();
        await conn.ping();
        console.log('✅ MySQL connected');
        conn.release();
    } catch (e) {
        console.error('❌ MySQL connect failed:', e);
    }
})();


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', 'views');

app.use(session({
    secret: 'your_secret_key_for_session',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));


function requireLogin(req, res, next) {

    // Pages allowed without login: Home, Login, Register, Forgot Password
    if (req.session.isLoggedIn || req.path === '/' || req.path === '/login' || req.path === '/register' || req.path === '/forgot-password') {
        next();
    } else {
        // Redirect if trying to access protected routes like /products or /cart
        res.redirect('/login');
    }
}

app.use(requireLogin);
app.get('/', (req, res) => {

    res.render('index', {
        isLoggedIn: req.session.isLoggedIn || false
    });
});

app.get('/login', (req, res) => {
    res.render('login', { error: null, success: req.query.success === 'true' });
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;


        const [rows] = await pool.query('SELECT * FROM Member WHERE email = ?', [email]);
        if (rows.length === 0) {
            // Changed to English
            return res.render('login', { error: 'Email not found. Please register.', success: false });
        }

        const member = rows[0];
        const isMatch = await bcrypt.compare(password, member.password);

        if (!isMatch) {
            // Changed to English
            return res.render('login', { error: 'Incorrect password.', success: false });
        }

        req.session.isLoggedIn = true;
        req.session.email = member.email;
        req.session.fullname = member.Fullname;

        return res.redirect('/dashboard');
    } catch (err) {
        console.error('❌ Login error:', err);
        // Changed to English
        return res.render('login', { error: 'An error occurred during login.', success: false });
    }
});


app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    try {
        const { fullname, dob, phone, email, password, address } = req.body;

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);


        const [exists] = await pool.query('SELECT email FROM Member WHERE email = ?', [email]);
        if (exists.length > 0) {
            // Changed to English
            return res.render('register', { error: 'This email is already in use. Please use another email.' });
        }

        await pool.query(
            `INSERT INTO Member (Fullname, DOB, phone, email, password, address)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [fullname, dob, phone, email, hashedPassword, address]
        );

        return res.redirect('/login?success=true');
    } catch (err) {
        console.error('❌ Register error:', err);
        // Changed to English
        return res.render('register', { error: 'Registration failed: ' + err.message });
    }
});

// Update: Pass error/success variables for password change
app.get('/dashboard', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }
    res.render('dashboard', {
        fullname: req.session.fullname,
        email: req.session.email,
        change_error: null,
        change_success: null
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        res.redirect('/');
    });
});


app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { error: null, success: null });
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM Member WHERE email = ?', [email]);

        if (rows.length === 0) {
            // Changed to English
            return res.render('forgot-password', { error: 'Email not found in the system.', success: null });
        }

        const tempPassword = Math.random().toString(36).substring(2, 10);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        await pool.execute('UPDATE Member SET password = ? WHERE email = ?', [hashedPassword, email]);

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'aeysirikorn2005@gmail.com',
                pass: 'bamy jmqm txuz ntrc'
            }
        });

        const mailOptions = {
            from: 'aeysirikorn2005@gmail.com',
            to: email,
            // Changed to English
            subject: '[Aoeyaeng Clothing] Your Temporary Password',
            // Changed to English
            text: `Your temporary password is: ${tempPassword}\n\nPlease use this password to log in and change your password immediately.`
        };

        await transporter.sendMail(mailOptions);

        // Changed to English
        res.render('forgot-password', { error: null, success: 'Temporary password sent to your email.' });

    } catch (err) {
        console.error('Error sending email:', err);
        // Changed to English
        res.render('forgot-password', { error: 'An error occurred while sending the email.', success: null });
    }
});


// **********************************************
// Route: Change Password
// **********************************************
app.post('/change-password', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    const { oldPassword, newPassword } = req.body;
    const email = req.session.email;

    try {
        const [rows] = await pool.query('SELECT * FROM Member WHERE email = ?', [email]);
        const member = rows[0];

        // 1. Check current password
        const isMatch = await bcrypt.compare(oldPassword, member.password);

        if (!isMatch) {
            // Changed to English
            return res.render('dashboard', {
                fullname: req.session.fullname,
                email: req.session.email,
                change_error: 'Current password is incorrect.',
                change_success: null
            });
        }

        // 2. Hash new password
        const saltRounds = 10;
        const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // 3. Update new password in DB
        await pool.query('UPDATE Member SET password = ? WHERE email = ?', [newHashedPassword, email]);

        // 4. Redirect to Dashboard with success message
        // Changed to English
        res.render('dashboard', {
            fullname: req.session.fullname,
            email: req.session.email,
            change_success: 'Password successfully changed.',
            change_error: null
        });

    } catch (err) {
        console.error('❌ Change password error:', err);
        // Changed to English
        res.render('dashboard', {
            fullname: req.session.fullname,
            email: req.session.email,
            change_error: 'An error occurred while changing the password.',
            change_success: null
        });
    }
});


// --- Product/Cart Routes ---

// Products Page
app.get('/products', async (req, res) => {
    try {
        const selectedCategory = req.query.category || 'all';
        let sqlQuery = 'SELECT * FROM Product';
        const queryParams = [];

        if (selectedCategory !== 'all') {
            sqlQuery += ' WHERE category = ?';
            queryParams.push(selectedCategory);
        }

        const [products] = await pool.query(sqlQuery, queryParams);
        const [categories] = await pool.query('SELECT DISTINCT category FROM Product');

        res.render('products', {
            products: products,
            categories: categories.map(row => row.category),
            selectedCategory: selectedCategory,
            isLoggedIn: req.session.isLoggedIn || false
        });
    } catch (err) {
        console.error('❌ Products load error:', err);
        res.status(500).send('Error loading products'); // English error message remains
    }
});

// Add to Cart Logic
app.post('/add-to-cart', async (req, res) => {
    if (!req.session.isLoggedIn) {
        // Changed to English
        return res.json({ success: false, message: 'Please log in before adding items to the cart.' });
    }

    const { product_id } = req.body;
    const member_email = req.session.email;
    const quantity = 1;

    try {
        // Check if item already exists in cart
        const [existingItem] = await pool.query(
            'SELECT * FROM Cart WHERE member_email = ? AND product_id = ?',
            [member_email, product_id]
        );

        if (existingItem.length > 0) {
            // Update quantity
            await pool.query(
                'UPDATE Cart SET quantity = quantity + ? WHERE member_email = ? AND product_id = ?',
                [quantity, member_email, product_id]
            );
        } else {
            // Insert new item
            await pool.query(
                'INSERT INTO Cart (member_email, product_id, quantity) VALUES (?, ?, ?)',
                [member_email, product_id, quantity]
            );
        }

        // Changed to English
        res.json({ success: true, message: 'Item added to cart.' });
    } catch (err) {
        console.error('❌ Add to cart error:', err);
        // Changed to English
        res.json({ success: false, message: 'Failed to add item to cart.' });
    }
});

// Cart Page
app.get('/cart', async (req, res) => {
    if (!req.session.isLoggedIn) {
        // Redirect to login if not logged in
        return res.redirect('/login');
    }

    const member_email = req.session.email;

    try {
        const [cartItems] = await pool.query(
            `SELECT 
                C.cart_id, 
                C.quantity, 
                P.product_id, 
                P.name, 
                P.price, 
                P.image_url,
                (C.quantity * P.price) AS total_price_item
             FROM Cart C
             JOIN Product P ON C.product_id = P.product_id
             WHERE C.member_email = ?`,
            [member_email]
        );

        const cartTotal = cartItems.reduce((sum, item) => sum + parseFloat(item.total_price_item), 0);

        res.render('cart', {
            cartItems: cartItems,
            cartTotal: cartTotal.toFixed(2),
            isLoggedIn: req.session.isLoggedIn || false
        });

    } catch (err) {
        console.error('❌ Cart load error:', err);
        res.status(500).send('Error loading cart'); // English error message remains
    }
});

// Remove from Cart Logic
app.post('/remove-from-cart', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.json({ success: false, message: 'Unauthorized' });
    }

    const { cart_id } = req.body;
    const member_email = req.session.email;

    try {
        await pool.query(
            'DELETE FROM Cart WHERE cart_id = ? AND member_email = ?',
            [cart_id, member_email]
        );
        // Changed to English
        res.json({ success: true, message: 'Item removed from cart.' });
    } catch (err) {
        console.error('❌ Remove from cart error:', err);
        // Changed to English
        res.json({ success: false, message: 'Failed to remove item.' });
    }
});

// Checkout Logic
app.post('/checkout', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.json({ success: false, message: 'Unauthorized' });
    }

    const member_email = req.session.email;

    try {
        // Clear the cart after "successful" checkout
        await pool.query('DELETE FROM Cart WHERE member_email = ?', [member_email]);

        // Changed to English
        res.json({ success: true, message: 'Order confirmed! Thank you for your purchase.' });
    } catch (err) {
        console.error('❌ Checkout error:', err);
        // Changed to English
        res.json({ success: false, message: 'An error occurred during checkout.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});