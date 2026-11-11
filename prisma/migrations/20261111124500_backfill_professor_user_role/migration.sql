INSERT INTO "_CargoToUsuario" ("A", "B")
SELECT cargo.id, professor.fk_usuario
FROM professor
JOIN cargo ON cargo.cargo = 'PROFESSOR'
ON CONFLICT ("A", "B") DO NOTHING;
