const bcrypt = require('bcryptjs');

// Test password hashing
async function testPassword() {
    const password = '111111';
    const hash = await bcrypt.hash(password, 10);
    
    console.log('Password:', password);
    console.log('Hash:', hash);
    
    // Verify
    const isValid = await bcrypt.compare(password, hash);
    console.log('Verification:', isValid);
}

testPassword();