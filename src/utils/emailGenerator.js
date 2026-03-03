const WORD_BANK = [
  'bright',
  'swift',
  'silver',
  'sunny',
  'clear',
  'river',
  'forest',
  'meadow',
  'falcon',
  'ember',
  'frost',
  'nova',
  'harbor',
  'atlas',
  'zenith',
  'orbit'
];

function pickRandomWord() {
  const randomIndex = Math.floor(Math.random() * WORD_BANK.length);
  return WORD_BANK[randomIndex];
}

function randomSuffix() {
  return Math.floor(1000 + Math.random() * 9000);
}

function generateRandomEmail(domains) {
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error('Cannot generate email: no domains configured.');
  }

  const selectedDomain = domains[Math.floor(Math.random() * domains.length)];
  const firstWord = pickRandomWord();
  const secondWord = pickRandomWord();
  const localPart = `${firstWord}${secondWord}${randomSuffix()}`;

  return `${localPart}@${selectedDomain}`;
}

module.exports = {
  generateRandomEmail
};
