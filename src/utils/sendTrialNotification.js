/**
 * Dispatches an automated email alert when a new restaurant registers for a free trial.
 * Uses FormSubmit AJAX API (free, reliable, no backend server needed).
 */
export async function notifyAdminOfNewTrial({
  restaurantName,
  ownerName,
  email,
  phone,
  address,
  currency,
  restaurantId,
}) {
  const adminEmail = 'smanpk@gmail.com';
  
  try {
    const payload = {
      _subject: `🎉 New Free Trial Request: ${restaurantName} (${ownerName})`,
      _template: 'table',
      _captcha: 'false',
      'Restaurant Name': restaurantName || 'N/A',
      'Owner Name': ownerName || 'N/A',
      'Owner Email': email || 'N/A',
      'Phone Number': phone || 'N/A',
      'Address / City': address || 'N/A',
      'Selected Currency': currency || 'N/A',
      'Restaurant ID': restaurantId || 'N/A',
      'Registration Time': new Date().toLocaleString(),
    };

    const response = await fetch(`https://formsubmit.co/ajax/${adminEmail}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn('FormSubmit notification status:', response.status);
    } else {
      console.log('✅ Trial alert email dispatched to', adminEmail);
    }
  } catch (error) {
    // Non-blocking error catch so user registration never fails due to email dispatch
    console.error('Failed to dispatch trial notification email:', error);
  }
}
