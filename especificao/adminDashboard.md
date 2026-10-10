Vamos criar um dashboard com alguns dados gerais do sistema.

em usuários criar um endpoint que devolva a quantidade de usuários existentes no sistema em geral, nesse endpoint permitir consultar por cargo e aceitar um cargo ou mais.

criar um endpoint para fazer a contagem de cada um das seguintes entidades do banco: cursos, inscrições, instituições e inscrições

para o endpoint de vagas restantes vai ter que criar um endpoint em que precisas analisar as seguintes condições: 
- o banco de dados nao possui o campo para a quantidade de vagas restantes, apenas o total (curso.vagas), 
- você vai ter que analisar a tabela de iscricao através da fk_curso, para fazer o cruzamento de dados entre inscrição e curso e comparar a quantidade de inscritos e a quantidade de vagas disponíveis em todos os cursos.

preciso de um outro endpoint que traga a quantidade de inscrições totais e também por status de alunos que estão em processo de inscrição em um curso, os status existentes são:
  PENDENTE
  DEFERIDO
  INDEFERIDO
  CANCELADO

preciso que no endpoint de curso, contenha o total de cursos e também traga a qauntidade de cursos por situação.

eu queria que se fosse possivel, trazer essas informações em apenas um endpoint, para facilitar o trabalho