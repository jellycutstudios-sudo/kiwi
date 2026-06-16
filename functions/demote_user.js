const admin = require('firebase-admin');

// Initialize Firebase Admin with project ID
admin.initializeApp({
  projectId: 'posrest-5a97f'
});

const db = admin.firestore();

async function run() {
  console.log('Searching for user with email smapk@gmail.com...');
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', 'smapk@gmail.com').get();

  if (snapshot.empty) {
    console.log('No user document found with email smapk@gmail.com.');
    return;
  }

  for (const doc of snapshot.docs) {
    console.log(`Found user: ${doc.id} (${doc.data().name}). Current role: ${doc.data().role}`);
    await doc.ref.update({
      role: 'admin' // Demote from super_admin to regular admin
    });
    console.log(`Successfully updated role of user ${doc.id} to "admin".`);
  }
}

run().catch(console.error);
