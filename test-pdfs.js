// Test script to check if PDFs are accessible in Supabase Storage
const supabaseUrl = 'https://jfddwgrnpqcajllmiiak.supabase.co';
const bucketName = 'bridge-documents';

const pdfFiles = [
  '2007LawsCompleteBg.pdf',
  'BridgeBasicsHandout.pdf',
  'Laws of bridge.pdf',
  'Въведение в Спортния Бридж.pdf'
];

console.log('Testing PDF accessibility in Supabase Storage...\n');

// Test each PDF URL
for (const file of pdfFiles) {
  const url = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${encodeURIComponent(file)}`;
  
  fetch(url, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        console.log(`✓ ${file}`);
        console.log(`  URL: ${url}\n`);
      } else {
        console.log(`✗ ${file} - Status: ${response.status}`);
      }
    })
    .catch(error => {
      console.log(`✗ ${file} - Error: ${error.message}`);
    });
}
