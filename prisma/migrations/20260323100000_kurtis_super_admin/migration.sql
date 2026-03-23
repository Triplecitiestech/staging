-- Promote Kurtis to SUPER_ADMIN (was incorrectly set to ADMIN)
UPDATE staff_users
SET role = 'SUPER_ADMIN',
    "updatedAt" = NOW()
WHERE email = 'kurtis@triplecitiestech.com'
  AND role != 'SUPER_ADMIN';
