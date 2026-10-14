-- Exclusively synthetic, local development only. No real users, emails, phones or feedback.
-- Auth users are NOT seeded. Use signup + trusted bootstrap for the first admin.
insert into public.organizations(id,name,slug) values('10000000-0000-4000-8000-000000000001','Organización de demostración','unidos-demo') on conflict do nothing;
insert into public.people(id,org_id,first_name,last_name) values
('10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','Alex','Ejemplo'),
('10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001','Sam','Ficticio') on conflict do nothing;
insert into public.teams(id,org_id,name) values
('10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000001','Media'),
('10000000-0000-4000-8000-000000000202','10000000-0000-4000-8000-000000000001','Alabanza y Adoración'),
('10000000-0000-4000-8000-000000000203','10000000-0000-4000-8000-000000000001','FOH / Audio'),
('10000000-0000-4000-8000-000000000204','10000000-0000-4000-8000-000000000001','LSA') on conflict do nothing;
insert into public.roles(id,org_id,team_id,name) values
('10000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000201','Operador de streaming'),
('10000000-0000-4000-8000-000000000302','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000201','Operador de multimedia'),
('10000000-0000-4000-8000-000000000303','10000000-0000-4000-8000-000000000001',null,'Predicador') on conflict do nothing;
insert into public.team_memberships(org_id,team_id,person_id) values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000101') on conflict do nothing;
insert into public.meeting_types(id,org_id,name,color) values
('10000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000001','Domingo','#2563eb'),
('10000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000001','Sábado','#7c3aed'),
('10000000-0000-4000-8000-000000000403','10000000-0000-4000-8000-000000000001','Oración','#168463') on conflict do nothing;
insert into public.block_types(id,org_id,name) select ('10000000-0000-4000-8000-'||lpad((500+n)::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001'::uuid,name from unnest(array['Prueba de sonido','Intercesión','Alabanza y Adoración','Ofrendas','Bienvenida','Anuncios','Mensaje','Cierre']) with ordinality t(name,n) on conflict do nothing;
insert into public.songs(id,org_id,title,artist) values('10000000-0000-4000-8000-000000000601','10000000-0000-4000-8000-000000000001','Canción de prueba','Autor ficticio') on conflict do nothing;
