-- Authorized Preview-only synthetic dataset, 17/10/2026. NOT a migration or default seed.
-- Target project: ivmhgizuofxdvvvzdxnl. Never run against another project.
-- Requires the three exact empty drafts created by the approved user through the UI.
-- One transaction; rerun/edited draft/ID collision fails closed, not an upsert.
-- No auth impersonation, Auth writes, grants, publication, mail, reset or deletion.
begin;
do $demo$
declare
 d jsonb := $data${
  "org": "fdc4c62b-d3a2-40d8-891c-d46f1b79c84a",
  "teams": [
    {
      "id": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
      "name": "DEMO · Música"
    },
    {
      "id": "d4156d4b-2f4b-5326-bbeb-143f94525ddf",
      "name": "DEMO · Audio"
    },
    {
      "id": "5bb66f05-da02-556f-97b2-298b7c172873",
      "name": "DEMO · Media"
    },
    {
      "id": "5f5b2857-b618-589d-975f-93a73185c8bb",
      "name": "DEMO · Anfitriones"
    },
    {
      "id": "8f86cb08-e84a-5b56-9208-3f79ac581619",
      "name": "DEMO · LSA"
    },
    {
      "id": "dbaccd72-f633-512f-87a2-9bf783e36286",
      "name": "DEMO · Coordinación"
    }
  ],
  "people": [
    {
      "id": "f8a4c35c-162b-5822-877d-e5a3d8cf7482",
      "first": "Alex",
      "last": "Demo 01",
      "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
      "role": "73bb7a86-3409-5fef-949a-d37f8ca27379",
      "roleName": "DEMO · Director musical"
    },
    {
      "id": "69626219-d542-5389-8dff-4f9e95d2f72e",
      "first": "Sam",
      "last": "Demo 02",
      "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
      "role": "647c0851-fb83-5c03-8b89-a11d53506a28",
      "roleName": "DEMO · Voz principal"
    },
    {
      "id": "86ae65de-0167-5176-a366-c3a549c2ce11",
      "first": "Ariel",
      "last": "Demo 03",
      "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
      "role": "7c8a31a6-a73b-5496-8953-2fe83171cf54",
      "roleName": "DEMO · Guitarrista"
    },
    {
      "id": "87453530-0f7d-504c-9495-c38e690aec3e",
      "first": "Dani",
      "last": "Demo 04",
      "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
      "role": "0a4d6c51-7a87-5601-814a-315f21dd63fa",
      "roleName": "DEMO · Tecladista"
    },
    {
      "id": "0484ec76-fa39-5ea4-a390-9e14607cf684",
      "first": "Luca",
      "last": "Demo 05",
      "team": "d4156d4b-2f4b-5326-bbeb-143f94525ddf",
      "role": "b8fb7aaa-2a42-5534-bb81-ef307c487534",
      "roleName": "DEMO · Operador FOH"
    },
    {
      "id": "3f4f158b-084b-5cda-b973-01cab4f4732d",
      "first": "Noa",
      "last": "Demo 06",
      "team": "d4156d4b-2f4b-5326-bbeb-143f94525ddf",
      "role": "d8d836b0-576d-536e-b181-30477b6bdf46",
      "roleName": "DEMO · Técnico de escenario"
    },
    {
      "id": "1eca7346-e547-5bc0-832d-3dbb51fe0b48",
      "first": "Cris",
      "last": "Demo 07",
      "team": "d4156d4b-2f4b-5326-bbeb-143f94525ddf",
      "role": "d04d6102-dd68-5b39-b7ae-5f1a96d7f265",
      "roleName": "DEMO · Operador de monitores"
    },
    {
      "id": "8d34110d-0762-552c-b8e6-5263124deba5",
      "first": "Nico",
      "last": "Demo 08",
      "team": "5bb66f05-da02-556f-97b2-298b7c172873",
      "role": "dd3be1af-47c2-5ec6-b3b3-2fa760b5d4f8",
      "roleName": "DEMO · Operador de streaming"
    },
    {
      "id": "ae1433a6-8750-58ec-840f-00cb62eb6e07",
      "first": "Fran",
      "last": "Demo 09",
      "team": "5bb66f05-da02-556f-97b2-298b7c172873",
      "role": "77149dc4-9e79-5e9c-b5c9-fb62f9744dbd",
      "roleName": "DEMO · Operador multimedia"
    },
    {
      "id": "1d17030d-1b29-5388-b044-088111603163",
      "first": "Vale",
      "last": "Demo 10",
      "team": "5bb66f05-da02-556f-97b2-298b7c172873",
      "role": "7f722191-e683-57c8-98a3-b745b4f1cfbc",
      "roleName": "DEMO · Camarógrafo"
    },
    {
      "id": "793a48fb-7253-52b9-8892-4d93c41ff623",
      "first": "Paz",
      "last": "Demo 11",
      "team": "5bb66f05-da02-556f-97b2-298b7c172873",
      "role": "62b40e84-c5f5-5209-9872-580deee09bdc",
      "roleName": "DEMO · Director de cámaras"
    },
    {
      "id": "a8bfbec8-66ad-583c-8911-d54540d03bd5",
      "first": "Sol",
      "last": "Demo 12",
      "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
      "role": "ef09255d-79bd-5406-935e-724abd4c47dd",
      "roleName": "DEMO · Coordinador de bienvenida"
    },
    {
      "id": "cb0e0956-066d-5ea9-87d1-bda880007829",
      "first": "Emi",
      "last": "Demo 13",
      "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
      "role": "0f570b6b-929e-51f5-8388-23564ca0f25d",
      "roleName": "DEMO · Anfitrión"
    },
    {
      "id": "6f895ef7-6853-5992-b8d8-9888e602f0f7",
      "first": "Ren",
      "last": "Demo 14",
      "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
      "role": "1b541e7f-30e7-58e6-b407-f40b6866e6c2",
      "roleName": "DEMO · Responsable de sala"
    },
    {
      "id": "07b1ccb3-3f38-5dd8-bae1-57e99f3b59c9",
      "first": "Robin",
      "last": "Demo 15",
      "team": "8f86cb08-e84a-5b56-9208-3f79ac581619",
      "role": "dc5f8f2e-a360-5971-9a57-c1eee5fd112d",
      "roleName": "DEMO · Intérprete LSA"
    },
    {
      "id": "b5fd1bfb-1041-57a9-8c0e-f1d5650b9b2b",
      "first": "Kim",
      "last": "Demo 16",
      "team": "8f86cb08-e84a-5b56-9208-3f79ac581619",
      "role": "d4bd6f49-589b-5f43-ac5d-6f46e3abb166",
      "roleName": "DEMO · Relevo LSA"
    },
    {
      "id": "c08384b5-629f-5646-a964-00a185ab3105",
      "first": "Charlie",
      "last": "Demo 17",
      "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
      "role": "997fde6b-4620-5f03-8d77-f5e105989891",
      "roleName": "DEMO · Conductor"
    },
    {
      "id": "86323099-345b-5fbb-a22f-586c0ed6d158",
      "first": "Sasha",
      "last": "Demo 18",
      "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
      "role": "7563f67d-e7bc-58fa-8fcc-86161b0310f3",
      "roleName": "DEMO · Predicador"
    },
    {
      "id": "809854b7-a2dc-51df-acea-0f8dde46ecd0",
      "first": "Morgan",
      "last": "Demo 19",
      "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
      "role": "fb4a6958-dbd5-5287-9c67-7cb9c5aa2689",
      "roleName": "DEMO · Guía de oración"
    },
    {
      "id": "ad07f64c-4ae3-5a2a-ab2a-206e45172b96",
      "first": "Taylor",
      "last": "Demo 20",
      "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
      "role": "a405d4b8-5c6f-5ad9-ba8f-c2c210a900b2",
      "roleName": "DEMO · Productor de reunión"
    }
  ],
  "types": [
    {
      "id": "363bee23-555a-525c-a0f7-ef63c35be2b1",
      "name": "DEMO · Prueba de sonido"
    },
    {
      "id": "d8f97981-4ff1-59f0-a084-f35055b03fb4",
      "name": "DEMO · Recepción"
    },
    {
      "id": "f7684e30-6b06-50e0-824c-58460fe758ae",
      "name": "DEMO · Bienvenida"
    },
    {
      "id": "1a435115-3e10-5f44-aa7f-f01e024a1345",
      "name": "DEMO · Alabanza y adoración"
    },
    {
      "id": "d70a8f4d-20e4-5b43-ac61-745dd3fec3b8",
      "name": "DEMO · Oración"
    },
    {
      "id": "caea2509-1eb6-501a-b528-ea6d97f9f428",
      "name": "DEMO · Lectura bíblica"
    },
    {
      "id": "c7072f8a-6a45-5c9e-9b8f-75f85a4f13a7",
      "name": "DEMO · Ofrendas"
    },
    {
      "id": "22c27662-1c7a-58a9-aaf2-7cae2ed51ae4",
      "name": "DEMO · Anuncios"
    },
    {
      "id": "3ccbbaa2-73d5-526a-abdd-d573eefe62a2",
      "name": "DEMO · Mensaje"
    },
    {
      "id": "7cd0a576-b719-5c60-8d3e-b6c9c49d2739",
      "name": "DEMO · Respuesta"
    },
    {
      "id": "ade67ba1-e497-5b49-99d1-4e23662c92d1",
      "name": "DEMO · Envío"
    },
    {
      "id": "27059e98-99d3-546c-98cc-6a22f6b090f4",
      "name": "DEMO · Cierre"
    }
  ],
  "meetings": [
    {
      "id": "f6f1d510-a9b3-44ba-aefd-e6959e1b4329",
      "title": "DEMO 01 · Celebración general",
      "date": "2026-10-25",
      "time": "10:30",
      "type": "19c189f0-ba75-5f94-a473-8ec7b1d8926f",
      "typeName": "DEMO · Celebración",
      "color": "#2563eb",
      "blocks": [
        {
          "id": "e08ac0c5-f10b-56e6-be2a-08cd558ae9b7",
          "type": "363bee23-555a-525c-a0f7-ef63c35be2b1",
          "name": "Prueba de sonido y repaso musical",
          "seconds": 900,
          "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
          "people": [
            1,
            2,
            3,
            4
          ]
        },
        {
          "id": "555caa00-baa4-54b2-a0ca-9f51b099b06e",
          "type": "d8f97981-4ff1-59f0-a084-f35055b03fb4",
          "name": "Recepción de familias y visitantes",
          "seconds": 600,
          "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
          "people": [
            12,
            13
          ]
        },
        {
          "id": "f23b4621-728d-566b-a30e-8ca1b4174487",
          "type": "f7684e30-6b06-50e0-824c-58460fe758ae",
          "name": "Bienvenida y apertura",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            17
          ]
        },
        {
          "id": "d775e7e6-2a30-5486-879b-88dca7cf1d30",
          "type": "1a435115-3e10-5f44-aa7f-f01e024a1345",
          "name": "Alabanza · tres canciones de ejemplo",
          "seconds": 1080,
          "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
          "people": [
            1,
            2,
            3,
            4
          ],
          "parallel": {
            "title": "Proyección de letras y apoyo visual",
            "team": "5bb66f05-da02-556f-97b2-298b7c172873",
            "seconds": 1080
          }
        },
        {
          "id": "2d883d49-af60-5ebc-9bc8-4d4508449dbd",
          "type": "d70a8f4d-20e4-5b43-ac61-745dd3fec3b8",
          "name": "Oración e intercesión",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            19
          ]
        },
        {
          "id": "9e7767f2-effe-57bf-96cf-db3df6ae4111",
          "type": "caea2509-1eb6-501a-b528-ea6d97f9f428",
          "name": "Lectura bíblica con interpretación LSA",
          "seconds": 240,
          "team": "8f86cb08-e84a-5b56-9208-3f79ac581619",
          "people": [
            15,
            16
          ]
        },
        {
          "id": "216b6a95-a885-5646-9517-298a4ff2722a",
          "type": "c7072f8a-6a45-5c9e-9b8f-75f85a4f13a7",
          "name": "Ofrendas y gratitud",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            20
          ]
        },
        {
          "id": "6b496d2c-bfbf-5168-8f63-67eedc81d8f4",
          "type": "22c27662-1c7a-58a9-aaf2-7cae2ed51ae4",
          "name": "Anuncios de la comunidad",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            17
          ]
        },
        {
          "id": "d86bb528-0e8f-5e71-9bc9-6b258b8961df",
          "type": "3ccbbaa2-73d5-526a-abdd-d573eefe62a2",
          "name": "Mensaje · Servir en unidad",
          "seconds": 1800,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            18
          ],
          "parallel": {
            "title": "Interpretación LSA del mensaje",
            "team": "8f86cb08-e84a-5b56-9208-3f79ac581619",
            "seconds": 1800
          }
        },
        {
          "id": "3b4a2ef7-e0c6-5ddc-8879-a1ddeb5137ed",
          "type": "7cd0a576-b719-5c60-8d3e-b6c9c49d2739",
          "name": "Respuesta y oración final",
          "seconds": 600,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            19
          ]
        },
        {
          "id": "388f8ce0-9569-551b-b2d7-9264a5d5e1bf",
          "type": "ade67ba1-e497-5b49-99d1-4e23662c92d1",
          "name": "Envío y próximos pasos",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            20
          ]
        },
        {
          "id": "5a4b898d-332e-53b4-a705-970d4ef06b33",
          "type": "27059e98-99d3-546c-98cc-6a22f6b090f4",
          "name": "Despedida y acompañamiento",
          "seconds": 480,
          "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
          "people": [
            12,
            13
          ]
        }
      ],
      "positions": [
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        14
      ]
    },
    {
      "id": "cc7cda50-60f0-487a-9c81-16a4c191f4ab",
      "title": "DEMO 02 · Encuentro de jóvenes",
      "date": "2026-10-28",
      "time": "19:30",
      "type": "9a31a58e-5eb3-52ca-a7ce-caa3f32b32b8",
      "typeName": "DEMO · Jóvenes",
      "color": "#7c3aed",
      "blocks": [
        {
          "id": "57379705-45f7-5a32-9eaf-e89c3856e639",
          "type": "f7684e30-6b06-50e0-824c-58460fe758ae",
          "name": "Bienvenida al encuentro de jóvenes",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            17
          ]
        },
        {
          "id": "bbae689c-6b2a-5bcb-8da0-d6d27e6d1d55",
          "type": "d8f97981-4ff1-59f0-a084-f35055b03fb4",
          "name": "Dinámica de integración",
          "seconds": 480,
          "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
          "people": [
            12,
            13
          ]
        },
        {
          "id": "cb80ace0-7c33-5b49-9f9d-fbedae19b1a0",
          "type": "1a435115-3e10-5f44-aa7f-f01e024a1345",
          "name": "Alabanza acústica",
          "seconds": 720,
          "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
          "people": [
            2,
            3
          ]
        },
        {
          "id": "0e88b960-0c35-5983-a03b-009e41780e7b",
          "type": "22c27662-1c7a-58a9-aaf2-7cae2ed51ae4",
          "name": "Anuncios y próximos encuentros",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            20
          ]
        },
        {
          "id": "db44479a-83d3-501c-9eb0-79d8d9127511",
          "type": "3ccbbaa2-73d5-526a-abdd-d573eefe62a2",
          "name": "Reflexión · Decisiones con propósito",
          "seconds": 1200,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            18
          ],
          "parallel": {
            "title": "Proyección de apoyo a la reflexión",
            "team": "5bb66f05-da02-556f-97b2-298b7c172873",
            "seconds": 1200
          }
        },
        {
          "id": "21049fe2-eff2-522f-8fa9-460d78e894f2",
          "type": "7cd0a576-b719-5c60-8d3e-b6c9c49d2739",
          "name": "Conversación en grupos pequeños",
          "seconds": 600,
          "team": "5f5b2857-b618-589d-975f-93a73185c8bb",
          "people": [
            12,
            13
          ]
        },
        {
          "id": "db6b8355-7277-5905-b6f8-26e184a43e6d",
          "type": "d70a8f4d-20e4-5b43-ac61-745dd3fec3b8",
          "name": "Oración por los grupos",
          "seconds": 600,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            19
          ]
        },
        {
          "id": "ad1e7406-787d-5c94-872b-490a933bd285",
          "type": "27059e98-99d3-546c-98cc-6a22f6b090f4",
          "name": "Cierre y despedida",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            17
          ]
        }
      ],
      "positions": [
        5,
        6,
        9,
        14
      ]
    },
    {
      "id": "cfb972d9-a4d1-44a2-9f83-1c0f87e5909d",
      "title": "DEMO 03 · Reunión de oración",
      "date": "2026-10-31",
      "time": "18:00",
      "type": "a73075f9-55a1-59dc-845d-25259b297ea3",
      "typeName": "DEMO · Oración",
      "color": "#168463",
      "blocks": [
        {
          "id": "e243ef00-3e0d-5086-ae90-2eabffe64bce",
          "type": "f7684e30-6b06-50e0-824c-58460fe758ae",
          "name": "Apertura y motivos de oración",
          "seconds": 300,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            17
          ]
        },
        {
          "id": "15a05741-8cec-54c4-85a8-f9aec042a92d",
          "type": "1a435115-3e10-5f44-aa7f-f01e024a1345",
          "name": "Adoración acústica",
          "seconds": 600,
          "team": "4d5c24a7-7d1a-5c76-8b19-e85ea616cfb2",
          "people": [
            2,
            4
          ]
        },
        {
          "id": "60f7e70d-b888-5e46-b075-359bf8876211",
          "type": "d70a8f4d-20e4-5b43-ac61-745dd3fec3b8",
          "name": "Intercesión por familias y comunidad",
          "seconds": 1200,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            19
          ]
        },
        {
          "id": "d353a601-45c1-5106-84be-a62567109d54",
          "type": "27059e98-99d3-546c-98cc-6a22f6b090f4",
          "name": "Gratitud y cierre",
          "seconds": 600,
          "team": "dbaccd72-f633-512f-87a2-9bf783e36286",
          "people": [
            20
          ]
        }
      ],
      "positions": [
        5,
        14
      ]
    }
  ]
}$data$::jsonb;
 org uuid := (d->>'org')::uuid;
 t jsonb; pe jsonb; mt jsonb; bl jsonb; pi jsonb;
 m public.meetings; r uuid; pos uuid; aid uuid; person jsonb;
 idx integer; pidx integer; old_security jsonb; old_meetings jsonb;
begin
 if not exists(select 1 from public.organizations where id=org and slug='unidos') then
   raise exception 'Wrong organization: refuse demo load';
 end if;
 -- Preserve both preexisting meetings byte-for-byte; no user IDs are read/exported.
 select jsonb_agg(to_jsonb(x) order by x.id) into old_meetings from public.meetings x
 where x.id in ('f1cd5ac4-9561-4821-b3fd-ad172abe3f95','f5f060ed-d3c2-4405-ab43-0a3b43330c09');
 select jsonb_build_array((select count(*) from auth.users),(select count(*) from public.profiles),
   (select count(*) from public.memberships),(select count(*) from public.permission_grants),
   (select count(*) from private.feedback_email_outbox)) into old_security;
 -- Lock only the three named drafts; require pristine state before adding anything.
 for mt in select value from jsonb_array_elements(d->'meetings') loop
   select * into m from public.meetings where id=(mt->>'id')::uuid for update;
   if m.id is null or m.org_id<>org or m.title<>mt->>'title' or m.status<>'draft'
     or m.date<>(mt->>'date')::date or m.start_local_time<>(mt->>'time')::time
     or m.timezone<>'America/Argentina/Buenos_Aires' or m.version<>1
     or m.published_revision_id is not null or m.closed_at is not null
     or not exists(select 1 from public.meeting_revisions where id=m.draft_revision_id and meeting_id=m.id and published_at is null)
     or exists(select 1 from public.meeting_blocks where revision_id=m.draft_revision_id)
     or exists(select 1 from public.assignments where meeting_id=m.id)
     or exists(select 1 from public.meeting_required_positions where meeting_id=m.id) then
     raise exception 'Draft missing, already populated or edited: refuse demo load';
   end if;
 end loop;
 for t in select value from jsonb_array_elements(d->'teams') loop
   insert into public.teams(id,org_id,name) values((t->>'id')::uuid,org,t->>'name');
 end loop;
 for pe in select value from jsonb_array_elements(d->'people') loop
   insert into public.people(id,org_id,first_name,last_name) values((pe->>'id')::uuid,org,pe->>'first',pe->>'last');
   insert into public.roles(id,org_id,team_id,name) values((pe->>'role')::uuid,org,(pe->>'team')::uuid,pe->>'roleName');
   insert into public.team_memberships(org_id,team_id,person_id) values(org,(pe->>'team')::uuid,(pe->>'id')::uuid);
 end loop;
 for t in select value from jsonb_array_elements(d->'types') loop
   insert into public.block_types(id,org_id,name) values((t->>'id')::uuid,org,t->>'name');
 end loop;
 for mt in select value from jsonb_array_elements(d->'meetings') loop
   select * into strict m from public.meetings where id=(mt->>'id')::uuid;
   r=m.draft_revision_id;
   insert into public.meeting_types(id,org_id,name,color) values((mt->>'type')::uuid,org,mt->>'typeName',mt->>'color');
   update public.meeting_revisions set meeting_type_id=(mt->>'type')::uuid where id=r and published_at is null;
   idx=0;
   for bl in select value from jsonb_array_elements(mt->'blocks') loop
     insert into public.meeting_blocks(id,org_id,revision_id,block_type_id,team_id,sort_order,name,duration_seconds,visibility)
     values((bl->>'id')::uuid,org,r,(bl->>'type')::uuid,(bl->>'team')::uuid,idx,bl->>'name',(bl->>'seconds')::integer,'public');
     insert into public.block_details(org_id,block_id,notes) values(org,(bl->>'id')::uuid,'DEMO: contenido ficticio para probar la planificación. No corresponde a un servicio real.');
     for pi in select value from jsonb_array_elements(bl->'people') loop
       person=(d->'people')->((pi#>>'{}')::integer-1);
       insert into public.assignments(org_id,meeting_id,block_id,person_id,team_id,role_id)
       values(org,m.id,(bl->>'id')::uuid,(person->>'id')::uuid,(person->>'team')::uuid,(person->>'role')::uuid) returning id into aid;
       insert into public.block_assignment_links(org_id,block_id,assignment_id) values(org,(bl->>'id')::uuid,aid);
     end loop;
     if bl ? 'parallel' then
       insert into public.block_subactivities(org_id,block_id,team_id,title,offset_seconds,duration_seconds,notes)
       values(org,(bl->>'id')::uuid,(bl->'parallel'->>'team')::uuid,bl->'parallel'->>'title',0,(bl->'parallel'->>'seconds')::integer,'DEMO: tarea simultánea, sin extender la duración principal.');
     end if;
     idx=idx+1;
   end loop;
   pidx=0;
   for pi in select value from jsonb_array_elements(mt->'positions') loop
     person=(d->'people')->((pi#>>'{}')::integer-1);
     insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority,quantity_index)
     values(org,m.id,(person->>'team')::uuid,(person->>'role')::uuid,
       case when (pi#>>'{}')::integer in (5,8,9) then 'critical'::public.position_priority
            when (pi#>>'{}')::integer in (7,11) then 'optional'::public.position_priority
            else 'required'::public.position_priority end,1) returning id into pos;
     insert into public.assignments(org_id,meeting_id,position_id,person_id,team_id,role_id)
     values(org,m.id,pos,(person->>'id')::uuid,(person->>'team')::uuid,(person->>'role')::uuid);
     pidx=pidx+1;
   end loop;
   update public.meetings set meeting_type_id=(mt->>'type')::uuid,version=version+1 where id=m.id and version=1;
   if not found then raise exception 'Concurrent edit';end if;
   if (select count(*) from public.meeting_blocks where revision_id=r)<>jsonb_array_length(mt->'blocks') then raise exception 'Wrong block count';end if;
 end loop;
 if old_security is distinct from jsonb_build_array((select count(*) from auth.users),(select count(*) from public.profiles),
   (select count(*) from public.memberships),(select count(*) from public.permission_grants),
   (select count(*) from private.feedback_email_outbox)) then raise exception 'Security or email counts changed';end if;
 if old_meetings is distinct from (select jsonb_agg(to_jsonb(x) order by x.id) from public.meetings x
   where x.id in ('f1cd5ac4-9561-4821-b3fd-ad172abe3f95','f5f060ed-d3c2-4405-ab43-0a3b43330c09')) then raise exception 'Existing meetings changed';end if;
end $demo$;
commit;
