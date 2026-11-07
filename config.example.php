<?php
// Copy to config.php on the host and fill in the hash of each person's code:
//   hex of PBKDF2-SHA256(code, salt 'mehr8-hmg|' + id, 200000 iterations, 32 bytes)
// e.g. php -r "echo hash_pbkdf2('sha256', 'CODE', 'mehr8-hmg|u1', 200000, 64);"
return [
  'u1' => '',
  'u2' => '',
  'u3' => '',
];
