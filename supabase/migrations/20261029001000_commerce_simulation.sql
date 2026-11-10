-- Development commerce simulation. No tariff seeds, local browser migration,
-- real payment approval, stock reservation/decrement or coupon redemption.
create role aro_commerce_executor nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
grant aro_commerce_executor to postgres;
grant usage on schema app,api,private,auth to aro_commerce_executor;
grant execute on function auth.uid(),auth.jwt(),private.is_admin(),private.require_catalog_admin()
  to aro_commerce_executor;
grant select(id) on auth.users to aro_commerce_executor;

create table app.commerce_locations (
  district text primary key check(district ~ '^[0-9]{6}$'),
  province text not null check(province ~ '^[0-9]{4}$'),
  department text not null,
  department_label text not null,province_label text not null,district_label text not null,
  unique(department,province,district)
);
-- Existing INEI UBIGEOS 2022 reference, exactly matching src/data/peru-ubigeo.json.
-- This is location vocabulary, not shipping coverage or business tariffs.
insert into app.commerce_locations(district,province,department,department_label,province_label,district_label) values
('010101','0101','amazonas','Amazonas','Chachapoyas','Chachapoyas'),
('010102','0101','amazonas','Amazonas','Chachapoyas','Asuncion'),
('010103','0101','amazonas','Amazonas','Chachapoyas','Balsas'),
('010104','0101','amazonas','Amazonas','Chachapoyas','Cheto'),
('010105','0101','amazonas','Amazonas','Chachapoyas','Chiliquin'),
('010106','0101','amazonas','Amazonas','Chachapoyas','Chuquibamba'),
('010107','0101','amazonas','Amazonas','Chachapoyas','Granada'),
('010108','0101','amazonas','Amazonas','Chachapoyas','Huancas'),
('010109','0101','amazonas','Amazonas','Chachapoyas','La Jalca'),
('010110','0101','amazonas','Amazonas','Chachapoyas','Leimebamba'),
('010111','0101','amazonas','Amazonas','Chachapoyas','Levanto'),
('010112','0101','amazonas','Amazonas','Chachapoyas','Magdalena'),
('010113','0101','amazonas','Amazonas','Chachapoyas','Mariscal Castilla'),
('010114','0101','amazonas','Amazonas','Chachapoyas','Molinopampa'),
('010115','0101','amazonas','Amazonas','Chachapoyas','Montevideo'),
('010116','0101','amazonas','Amazonas','Chachapoyas','Olleros'),
('010117','0101','amazonas','Amazonas','Chachapoyas','Quinjalca'),
('010118','0101','amazonas','Amazonas','Chachapoyas','San Francisco de Daguas'),
('010119','0101','amazonas','Amazonas','Chachapoyas','San Isidro de Maino'),
('010120','0101','amazonas','Amazonas','Chachapoyas','Soloco'),
('010121','0101','amazonas','Amazonas','Chachapoyas','Sonche'),
('010201','0102','amazonas','Amazonas','Bagua','Bagua'),
('010202','0102','amazonas','Amazonas','Bagua','Aramango'),
('010203','0102','amazonas','Amazonas','Bagua','Copallin'),
('010204','0102','amazonas','Amazonas','Bagua','El Parco'),
('010205','0102','amazonas','Amazonas','Bagua','Imaza'),
('010206','0102','amazonas','Amazonas','Bagua','La Peca'),
('010301','0103','amazonas','Amazonas','Bongara','Jumbilla'),
('010302','0103','amazonas','Amazonas','Bongara','Chisquilla'),
('010303','0103','amazonas','Amazonas','Bongara','Churuja'),
('010304','0103','amazonas','Amazonas','Bongara','Corosha'),
('010305','0103','amazonas','Amazonas','Bongara','Cuispes'),
('010306','0103','amazonas','Amazonas','Bongara','Florida'),
('010307','0103','amazonas','Amazonas','Bongara','Jazan'),
('010308','0103','amazonas','Amazonas','Bongara','Recta'),
('010309','0103','amazonas','Amazonas','Bongara','San Carlos'),
('010310','0103','amazonas','Amazonas','Bongara','Shipasbamba'),
('010311','0103','amazonas','Amazonas','Bongara','Valera'),
('010312','0103','amazonas','Amazonas','Bongara','Yambrasbamba'),
('010401','0104','amazonas','Amazonas','Condorcanqui','Nieva'),
('010402','0104','amazonas','Amazonas','Condorcanqui','El Cenepa'),
('010403','0104','amazonas','Amazonas','Condorcanqui','Rio Santiago'),
('010501','0105','amazonas','Amazonas','Luya','Lamud'),
('010502','0105','amazonas','Amazonas','Luya','Camporredondo'),
('010503','0105','amazonas','Amazonas','Luya','Cocabamba'),
('010504','0105','amazonas','Amazonas','Luya','Colcamar'),
('010505','0105','amazonas','Amazonas','Luya','Conila'),
('010506','0105','amazonas','Amazonas','Luya','Inguilpata'),
('010507','0105','amazonas','Amazonas','Luya','Longuita'),
('010508','0105','amazonas','Amazonas','Luya','Lonya Chico'),
('010509','0105','amazonas','Amazonas','Luya','Luya'),
('010510','0105','amazonas','Amazonas','Luya','Luya Viejo'),
('010511','0105','amazonas','Amazonas','Luya','Maria'),
('010512','0105','amazonas','Amazonas','Luya','Ocalli'),
('010513','0105','amazonas','Amazonas','Luya','Ocumal'),
('010514','0105','amazonas','Amazonas','Luya','Pisuquia'),
('010515','0105','amazonas','Amazonas','Luya','Providencia'),
('010516','0105','amazonas','Amazonas','Luya','San Cristobal'),
('010517','0105','amazonas','Amazonas','Luya','San Francisco del Yeso'),
('010518','0105','amazonas','Amazonas','Luya','San Jeronimo'),
('010519','0105','amazonas','Amazonas','Luya','San Juan de Lopecancha'),
('010520','0105','amazonas','Amazonas','Luya','Santa Catalina'),
('010521','0105','amazonas','Amazonas','Luya','Santo Tomas'),
('010522','0105','amazonas','Amazonas','Luya','Tingo'),
('010523','0105','amazonas','Amazonas','Luya','Trita'),
('010601','0106','amazonas','Amazonas','Rodriguez de Mendoza','San Nicolas'),
('010602','0106','amazonas','Amazonas','Rodriguez de Mendoza','Chirimoto'),
('010603','0106','amazonas','Amazonas','Rodriguez de Mendoza','Cochamal'),
('010604','0106','amazonas','Amazonas','Rodriguez de Mendoza','Huambo'),
('010605','0106','amazonas','Amazonas','Rodriguez de Mendoza','Limabamba'),
('010606','0106','amazonas','Amazonas','Rodriguez de Mendoza','Longar'),
('010607','0106','amazonas','Amazonas','Rodriguez de Mendoza','Mariscal Benavides'),
('010608','0106','amazonas','Amazonas','Rodriguez de Mendoza','Milpuc'),
('010609','0106','amazonas','Amazonas','Rodriguez de Mendoza','Omia'),
('010610','0106','amazonas','Amazonas','Rodriguez de Mendoza','Santa Rosa'),
('010611','0106','amazonas','Amazonas','Rodriguez de Mendoza','Totora'),
('010612','0106','amazonas','Amazonas','Rodriguez de Mendoza','Vista Alegre'),
('010701','0107','amazonas','Amazonas','Utcubamba','Bagua Grande'),
('010702','0107','amazonas','Amazonas','Utcubamba','Cajaruro'),
('010703','0107','amazonas','Amazonas','Utcubamba','Cumba'),
('010704','0107','amazonas','Amazonas','Utcubamba','El Milagro'),
('010705','0107','amazonas','Amazonas','Utcubamba','Jamalca'),
('010706','0107','amazonas','Amazonas','Utcubamba','Lonya Grande'),
('010707','0107','amazonas','Amazonas','Utcubamba','Yamon'),
('020101','0201','ancash','Áncash','Huaraz','Huaraz'),
('020102','0201','ancash','Áncash','Huaraz','Cochabamba'),
('020103','0201','ancash','Áncash','Huaraz','Colcabamba'),
('020104','0201','ancash','Áncash','Huaraz','Huanchay'),
('020105','0201','ancash','Áncash','Huaraz','Independencia'),
('020106','0201','ancash','Áncash','Huaraz','Jangas'),
('020107','0201','ancash','Áncash','Huaraz','La Libertad'),
('020108','0201','ancash','Áncash','Huaraz','Olleros'),
('020109','0201','ancash','Áncash','Huaraz','Pampas Grande'),
('020110','0201','ancash','Áncash','Huaraz','Pariacoto'),
('020111','0201','ancash','Áncash','Huaraz','Pira'),
('020112','0201','ancash','Áncash','Huaraz','Tarica'),
('020201','0202','ancash','Áncash','Aija','Aija'),
('020202','0202','ancash','Áncash','Aija','Coris'),
('020203','0202','ancash','Áncash','Aija','Huacllan'),
('020204','0202','ancash','Áncash','Aija','La Merced'),
('020205','0202','ancash','Áncash','Aija','Succha'),
('020301','0203','ancash','Áncash','Antonio Raymondi','Llamellin'),
('020302','0203','ancash','Áncash','Antonio Raymondi','Aczo'),
('020303','0203','ancash','Áncash','Antonio Raymondi','Chaccho'),
('020304','0203','ancash','Áncash','Antonio Raymondi','Chingas'),
('020305','0203','ancash','Áncash','Antonio Raymondi','Mirgas'),
('020306','0203','ancash','Áncash','Antonio Raymondi','San Juan de Rontoy'),
('020401','0204','ancash','Áncash','Asuncion','Chacas'),
('020402','0204','ancash','Áncash','Asuncion','Acochaca'),
('020501','0205','ancash','Áncash','Bolognesi','Chiquian'),
('020502','0205','ancash','Áncash','Bolognesi','Abelardo Pardo Lezameta'),
('020503','0205','ancash','Áncash','Bolognesi','Antonio Raymondi'),
('020504','0205','ancash','Áncash','Bolognesi','Aquia'),
('020505','0205','ancash','Áncash','Bolognesi','Cajacay'),
('020506','0205','ancash','Áncash','Bolognesi','Canis'),
('020507','0205','ancash','Áncash','Bolognesi','Colquioc'),
('020508','0205','ancash','Áncash','Bolognesi','Huallanca'),
('020509','0205','ancash','Áncash','Bolognesi','Huasta'),
('020510','0205','ancash','Áncash','Bolognesi','Huayllacayan'),
('020511','0205','ancash','Áncash','Bolognesi','La Primavera'),
('020512','0205','ancash','Áncash','Bolognesi','Mangas'),
('020513','0205','ancash','Áncash','Bolognesi','Pacllon'),
('020514','0205','ancash','Áncash','Bolognesi','San Miguel de Corpanqui'),
('020515','0205','ancash','Áncash','Bolognesi','Ticllos'),
('020601','0206','ancash','Áncash','Carhuaz','Carhuaz'),
('020602','0206','ancash','Áncash','Carhuaz','Acopampa'),
('020603','0206','ancash','Áncash','Carhuaz','Amashca'),
('020604','0206','ancash','Áncash','Carhuaz','Anta'),
('020605','0206','ancash','Áncash','Carhuaz','Ataquero'),
('020606','0206','ancash','Áncash','Carhuaz','Marcara'),
('020607','0206','ancash','Áncash','Carhuaz','Pariahuanca'),
('020608','0206','ancash','Áncash','Carhuaz','San Miguel de Aco'),
('020609','0206','ancash','Áncash','Carhuaz','Shilla'),
('020610','0206','ancash','Áncash','Carhuaz','Tinco'),
('020611','0206','ancash','Áncash','Carhuaz','Yungar'),
('020701','0207','ancash','Áncash','Carlos Fermin Fitzcarrald','San Luis'),
('020702','0207','ancash','Áncash','Carlos Fermin Fitzcarrald','San Nicolas'),
('020703','0207','ancash','Áncash','Carlos Fermin Fitzcarrald','Yauya'),
('020801','0208','ancash','Áncash','Casma','Casma'),
('020802','0208','ancash','Áncash','Casma','Buena Vista Alta'),
('020803','0208','ancash','Áncash','Casma','Comandante Noel'),
('020804','0208','ancash','Áncash','Casma','Yautan'),
('020901','0209','ancash','Áncash','Corongo','Corongo'),
('020902','0209','ancash','Áncash','Corongo','Aco'),
('020903','0209','ancash','Áncash','Corongo','Bambas'),
('020904','0209','ancash','Áncash','Corongo','Cusca'),
('020905','0209','ancash','Áncash','Corongo','La Pampa'),
('020906','0209','ancash','Áncash','Corongo','Yanac'),
('020907','0209','ancash','Áncash','Corongo','Yupan'),
('021001','0210','ancash','Áncash','Huari','Huari'),
('021002','0210','ancash','Áncash','Huari','Anra'),
('021003','0210','ancash','Áncash','Huari','Cajay'),
('021004','0210','ancash','Áncash','Huari','Chavin de Huantar'),
('021005','0210','ancash','Áncash','Huari','Huacachi'),
('021006','0210','ancash','Áncash','Huari','Huacchis'),
('021007','0210','ancash','Áncash','Huari','Huachis'),
('021008','0210','ancash','Áncash','Huari','Huantar'),
('021009','0210','ancash','Áncash','Huari','Masin'),
('021010','0210','ancash','Áncash','Huari','Paucas'),
('021011','0210','ancash','Áncash','Huari','Ponto'),
('021012','0210','ancash','Áncash','Huari','Rahuapampa'),
('021013','0210','ancash','Áncash','Huari','Rapayan'),
('021014','0210','ancash','Áncash','Huari','San Marcos'),
('021015','0210','ancash','Áncash','Huari','San Pedro de Chana'),
('021016','0210','ancash','Áncash','Huari','Uco'),
('021101','0211','ancash','Áncash','Huarmey','Huarmey'),
('021102','0211','ancash','Áncash','Huarmey','Cochapeti'),
('021103','0211','ancash','Áncash','Huarmey','Culebras'),
('021104','0211','ancash','Áncash','Huarmey','Huayan'),
('021105','0211','ancash','Áncash','Huarmey','Malvas'),
('021201','0212','ancash','Áncash','Huaylas','Caraz'),
('021202','0212','ancash','Áncash','Huaylas','Huallanca'),
('021203','0212','ancash','Áncash','Huaylas','Huata'),
('021204','0212','ancash','Áncash','Huaylas','Huaylas'),
('021205','0212','ancash','Áncash','Huaylas','Mato'),
('021206','0212','ancash','Áncash','Huaylas','Pamparomas'),
('021207','0212','ancash','Áncash','Huaylas','Pueblo Libre'),
('021208','0212','ancash','Áncash','Huaylas','Santa Cruz'),
('021209','0212','ancash','Áncash','Huaylas','Santo Toribio'),
('021210','0212','ancash','Áncash','Huaylas','Yuracmarca'),
('021301','0213','ancash','Áncash','Mariscal Luzuriaga','Piscobamba'),
('021302','0213','ancash','Áncash','Mariscal Luzuriaga','Casca'),
('021303','0213','ancash','Áncash','Mariscal Luzuriaga','Eleazar Guzman Barron'),
('021304','0213','ancash','Áncash','Mariscal Luzuriaga','Fidel Olivas Escudero'),
('021305','0213','ancash','Áncash','Mariscal Luzuriaga','Llama'),
('021306','0213','ancash','Áncash','Mariscal Luzuriaga','Llumpa'),
('021307','0213','ancash','Áncash','Mariscal Luzuriaga','Lucma'),
('021308','0213','ancash','Áncash','Mariscal Luzuriaga','Musga'),
('021401','0214','ancash','Áncash','Ocros','Ocros'),
('021402','0214','ancash','Áncash','Ocros','Acas'),
('021403','0214','ancash','Áncash','Ocros','Cajamarquilla'),
('021404','0214','ancash','Áncash','Ocros','Carhuapampa'),
('021405','0214','ancash','Áncash','Ocros','Cochas'),
('021406','0214','ancash','Áncash','Ocros','Congas'),
('021407','0214','ancash','Áncash','Ocros','Llipa'),
('021408','0214','ancash','Áncash','Ocros','San Cristobal de Rajan'),
('021409','0214','ancash','Áncash','Ocros','San Pedro'),
('021410','0214','ancash','Áncash','Ocros','Santiago de Chilcas'),
('021501','0215','ancash','Áncash','Pallasca','Cabana'),
('021502','0215','ancash','Áncash','Pallasca','Bolognesi'),
('021503','0215','ancash','Áncash','Pallasca','Conchucos'),
('021504','0215','ancash','Áncash','Pallasca','Huacaschuque'),
('021505','0215','ancash','Áncash','Pallasca','Huandoval'),
('021506','0215','ancash','Áncash','Pallasca','Lacabamba'),
('021507','0215','ancash','Áncash','Pallasca','Llapo'),
('021508','0215','ancash','Áncash','Pallasca','Pallasca'),
('021509','0215','ancash','Áncash','Pallasca','Pampas'),
('021510','0215','ancash','Áncash','Pallasca','Santa Rosa'),
('021511','0215','ancash','Áncash','Pallasca','Tauca'),
('021601','0216','ancash','Áncash','Pomabamba','Pomabamba'),
('021602','0216','ancash','Áncash','Pomabamba','Huayllan'),
('021603','0216','ancash','Áncash','Pomabamba','Parobamba'),
('021604','0216','ancash','Áncash','Pomabamba','Quinuabamba'),
('021701','0217','ancash','Áncash','Recuay','Recuay'),
('021702','0217','ancash','Áncash','Recuay','Catac'),
('021703','0217','ancash','Áncash','Recuay','Cotaparaco'),
('021704','0217','ancash','Áncash','Recuay','Huayllapampa'),
('021705','0217','ancash','Áncash','Recuay','Llacllin'),
('021706','0217','ancash','Áncash','Recuay','Marca'),
('021707','0217','ancash','Áncash','Recuay','Pampas Chico'),
('021708','0217','ancash','Áncash','Recuay','Pararin'),
('021709','0217','ancash','Áncash','Recuay','Tapacocha'),
('021710','0217','ancash','Áncash','Recuay','Ticapampa'),
('021801','0218','ancash','Áncash','Santa','Chimbote'),
('021802','0218','ancash','Áncash','Santa','Caceres del Peru'),
('021803','0218','ancash','Áncash','Santa','Coishco'),
('021804','0218','ancash','Áncash','Santa','Macate'),
('021805','0218','ancash','Áncash','Santa','Moro'),
('021806','0218','ancash','Áncash','Santa','Nepeña'),
('021807','0218','ancash','Áncash','Santa','Samanco'),
('021808','0218','ancash','Áncash','Santa','Santa'),
('021809','0218','ancash','Áncash','Santa','Nuevo Chimbote'),
('021901','0219','ancash','Áncash','Sihuas','Sihuas'),
('021902','0219','ancash','Áncash','Sihuas','Acobamba'),
('021903','0219','ancash','Áncash','Sihuas','Alfonso Ugarte'),
('021904','0219','ancash','Áncash','Sihuas','Cashapampa'),
('021905','0219','ancash','Áncash','Sihuas','Chingalpo'),
('021906','0219','ancash','Áncash','Sihuas','Huayllabamba'),
('021907','0219','ancash','Áncash','Sihuas','Quiches'),
('021908','0219','ancash','Áncash','Sihuas','Ragash'),
('021909','0219','ancash','Áncash','Sihuas','San Juan'),
('021910','0219','ancash','Áncash','Sihuas','Sicsibamba'),
('022001','0220','ancash','Áncash','Yungay','Yungay'),
('022002','0220','ancash','Áncash','Yungay','Cascapara'),
('022003','0220','ancash','Áncash','Yungay','Mancos'),
('022004','0220','ancash','Áncash','Yungay','Matacoto'),
('022005','0220','ancash','Áncash','Yungay','Quillo'),
('022006','0220','ancash','Áncash','Yungay','Ranrahirca'),
('022007','0220','ancash','Áncash','Yungay','Shupluy'),
('022008','0220','ancash','Áncash','Yungay','Yanama'),
('030101','0301','apurimac','Apurímac','Abancay','Abancay'),
('030102','0301','apurimac','Apurímac','Abancay','Chacoche'),
('030103','0301','apurimac','Apurímac','Abancay','Circa'),
('030104','0301','apurimac','Apurímac','Abancay','Curahuasi'),
('030105','0301','apurimac','Apurímac','Abancay','Huanipaca'),
('030106','0301','apurimac','Apurímac','Abancay','Lambrama'),
('030107','0301','apurimac','Apurímac','Abancay','Pichirhua'),
('030108','0301','apurimac','Apurímac','Abancay','San Pedro de Cachora'),
('030109','0301','apurimac','Apurímac','Abancay','Tamburco'),
('030201','0302','apurimac','Apurímac','Andahuaylas','Andahuaylas'),
('030202','0302','apurimac','Apurímac','Andahuaylas','Andarapa'),
('030203','0302','apurimac','Apurímac','Andahuaylas','Chiara'),
('030204','0302','apurimac','Apurímac','Andahuaylas','Huancarama'),
('030205','0302','apurimac','Apurímac','Andahuaylas','Huancaray'),
('030206','0302','apurimac','Apurímac','Andahuaylas','Huayana'),
('030207','0302','apurimac','Apurímac','Andahuaylas','Kishuara'),
('030208','0302','apurimac','Apurímac','Andahuaylas','Pacobamba'),
('030209','0302','apurimac','Apurímac','Andahuaylas','Pacucha'),
('030210','0302','apurimac','Apurímac','Andahuaylas','Pampachiri'),
('030211','0302','apurimac','Apurímac','Andahuaylas','Pomacocha'),
('030212','0302','apurimac','Apurímac','Andahuaylas','San Antonio de Cachi'),
('030213','0302','apurimac','Apurímac','Andahuaylas','San Jeronimo'),
('030214','0302','apurimac','Apurímac','Andahuaylas','San Miguel de Chaccrampa'),
('030215','0302','apurimac','Apurímac','Andahuaylas','Santa Maria de Chicmo'),
('030216','0302','apurimac','Apurímac','Andahuaylas','Talavera'),
('030217','0302','apurimac','Apurímac','Andahuaylas','Tumay Huaraca'),
('030218','0302','apurimac','Apurímac','Andahuaylas','Turpo'),
('030219','0302','apurimac','Apurímac','Andahuaylas','Kaquiabamba'),
('030220','0302','apurimac','Apurímac','Andahuaylas','Jose Maria Arguedas'),
('030301','0303','apurimac','Apurímac','Antabamba','Antabamba'),
('030302','0303','apurimac','Apurímac','Antabamba','El Oro'),
('030303','0303','apurimac','Apurímac','Antabamba','Huaquirca'),
('030304','0303','apurimac','Apurímac','Antabamba','Juan Espinoza Medrano'),
('030305','0303','apurimac','Apurímac','Antabamba','Oropesa'),
('030306','0303','apurimac','Apurímac','Antabamba','Pachaconas'),
('030307','0303','apurimac','Apurímac','Antabamba','Sabaino'),
('030401','0304','apurimac','Apurímac','Aymaraes','Chalhuanca'),
('030402','0304','apurimac','Apurímac','Aymaraes','Capaya'),
('030403','0304','apurimac','Apurímac','Aymaraes','Caraybamba'),
('030404','0304','apurimac','Apurímac','Aymaraes','Chapimarca'),
('030405','0304','apurimac','Apurímac','Aymaraes','Colcabamba'),
('030406','0304','apurimac','Apurímac','Aymaraes','Cotaruse'),
('030407','0304','apurimac','Apurímac','Aymaraes','Ihuayllo'),
('030408','0304','apurimac','Apurímac','Aymaraes','Justo Apu Sahuaraura'),
('030409','0304','apurimac','Apurímac','Aymaraes','Lucre'),
('030410','0304','apurimac','Apurímac','Aymaraes','Pocohuanca'),
('030411','0304','apurimac','Apurímac','Aymaraes','San Juan de Chacña'),
('030412','0304','apurimac','Apurímac','Aymaraes','Sañayca'),
('030413','0304','apurimac','Apurímac','Aymaraes','Soraya'),
('030414','0304','apurimac','Apurímac','Aymaraes','Tapairihua'),
('030415','0304','apurimac','Apurímac','Aymaraes','Tintay'),
('030416','0304','apurimac','Apurímac','Aymaraes','Toraya'),
('030417','0304','apurimac','Apurímac','Aymaraes','Yanaca'),
('030501','0305','apurimac','Apurímac','Cotabambas','Tambobamba'),
('030502','0305','apurimac','Apurímac','Cotabambas','Cotabambas'),
('030503','0305','apurimac','Apurímac','Cotabambas','Coyllurqui'),
('030504','0305','apurimac','Apurímac','Cotabambas','Haquira'),
('030505','0305','apurimac','Apurímac','Cotabambas','Mara'),
('030506','0305','apurimac','Apurímac','Cotabambas','Challhuahuacho'),
('030601','0306','apurimac','Apurímac','Chincheros','Chincheros'),
('030602','0306','apurimac','Apurímac','Chincheros','Anco_huallo'),
('030603','0306','apurimac','Apurímac','Chincheros','Cocharcas'),
('030604','0306','apurimac','Apurímac','Chincheros','Huaccana'),
('030605','0306','apurimac','Apurímac','Chincheros','Ocobamba'),
('030606','0306','apurimac','Apurímac','Chincheros','Ongoy'),
('030607','0306','apurimac','Apurímac','Chincheros','Uranmarca'),
('030608','0306','apurimac','Apurímac','Chincheros','Ranracancha'),
('030609','0306','apurimac','Apurímac','Chincheros','Rocchacc'),
('030610','0306','apurimac','Apurímac','Chincheros','El Porvenir'),
('030611','0306','apurimac','Apurímac','Chincheros','Los Chankas'),
('030612','0306','apurimac','Apurímac','Chincheros','Ahuayro'),
('030701','0307','apurimac','Apurímac','Grau','Chuquibambilla'),
('030702','0307','apurimac','Apurímac','Grau','Curpahuasi'),
('030703','0307','apurimac','Apurímac','Grau','Gamarra'),
('030704','0307','apurimac','Apurímac','Grau','Huayllati'),
('030705','0307','apurimac','Apurímac','Grau','Mamara'),
('030706','0307','apurimac','Apurímac','Grau','Micaela Bastidas'),
('030707','0307','apurimac','Apurímac','Grau','Pataypampa'),
('030708','0307','apurimac','Apurímac','Grau','Progreso'),
('030709','0307','apurimac','Apurímac','Grau','San Antonio'),
('030710','0307','apurimac','Apurímac','Grau','Santa Rosa'),
('030711','0307','apurimac','Apurímac','Grau','Turpay'),
('030712','0307','apurimac','Apurímac','Grau','Vilcabamba'),
('030713','0307','apurimac','Apurímac','Grau','Virundo'),
('030714','0307','apurimac','Apurímac','Grau','Curasco'),
('040101','0401','arequipa','Arequipa','Arequipa','Arequipa'),
('040102','0401','arequipa','Arequipa','Arequipa','Alto Selva Alegre'),
('040103','0401','arequipa','Arequipa','Arequipa','Cayma'),
('040104','0401','arequipa','Arequipa','Arequipa','Cerro Colorado'),
('040105','0401','arequipa','Arequipa','Arequipa','Characato'),
('040106','0401','arequipa','Arequipa','Arequipa','Chiguata'),
('040107','0401','arequipa','Arequipa','Arequipa','Jacobo Hunter'),
('040108','0401','arequipa','Arequipa','Arequipa','La Joya'),
('040109','0401','arequipa','Arequipa','Arequipa','Mariano Melgar'),
('040110','0401','arequipa','Arequipa','Arequipa','Miraflores'),
('040111','0401','arequipa','Arequipa','Arequipa','Mollebaya'),
('040112','0401','arequipa','Arequipa','Arequipa','Paucarpata'),
('040113','0401','arequipa','Arequipa','Arequipa','Pocsi'),
('040114','0401','arequipa','Arequipa','Arequipa','Polobaya'),
('040115','0401','arequipa','Arequipa','Arequipa','Quequeña'),
('040116','0401','arequipa','Arequipa','Arequipa','Sabandia'),
('040117','0401','arequipa','Arequipa','Arequipa','Sachaca'),
('040118','0401','arequipa','Arequipa','Arequipa','San Juan de Siguas'),
('040119','0401','arequipa','Arequipa','Arequipa','San Juan de Tarucani'),
('040120','0401','arequipa','Arequipa','Arequipa','Santa Isabel de Siguas'),
('040121','0401','arequipa','Arequipa','Arequipa','Santa Rita de Siguas'),
('040122','0401','arequipa','Arequipa','Arequipa','Socabaya'),
('040123','0401','arequipa','Arequipa','Arequipa','Tiabaya'),
('040124','0401','arequipa','Arequipa','Arequipa','Uchumayo'),
('040125','0401','arequipa','Arequipa','Arequipa','Vitor'),
('040126','0401','arequipa','Arequipa','Arequipa','Yanahuara'),
('040127','0401','arequipa','Arequipa','Arequipa','Yarabamba'),
('040128','0401','arequipa','Arequipa','Arequipa','Yura'),
('040129','0401','arequipa','Arequipa','Arequipa','Jose Luis Bustamante y Rivero'),
('040201','0402','arequipa','Arequipa','Camana','Camana'),
('040202','0402','arequipa','Arequipa','Camana','Jose Maria Quimper'),
('040203','0402','arequipa','Arequipa','Camana','Mariano Nicolas Valcarcel'),
('040204','0402','arequipa','Arequipa','Camana','Mariscal Caceres'),
('040205','0402','arequipa','Arequipa','Camana','Nicolas de Pierola'),
('040206','0402','arequipa','Arequipa','Camana','Ocoña'),
('040207','0402','arequipa','Arequipa','Camana','Quilca'),
('040208','0402','arequipa','Arequipa','Camana','Samuel Pastor'),
('040301','0403','arequipa','Arequipa','Caraveli','Caraveli'),
('040302','0403','arequipa','Arequipa','Caraveli','Acari'),
('040303','0403','arequipa','Arequipa','Caraveli','Atico'),
('040304','0403','arequipa','Arequipa','Caraveli','Atiquipa'),
('040305','0403','arequipa','Arequipa','Caraveli','Bella Union'),
('040306','0403','arequipa','Arequipa','Caraveli','Cahuacho'),
('040307','0403','arequipa','Arequipa','Caraveli','Chala'),
('040308','0403','arequipa','Arequipa','Caraveli','Chaparra'),
('040309','0403','arequipa','Arequipa','Caraveli','Huanuhuanu'),
('040310','0403','arequipa','Arequipa','Caraveli','Jaqui'),
('040311','0403','arequipa','Arequipa','Caraveli','Lomas'),
('040312','0403','arequipa','Arequipa','Caraveli','Quicacha'),
('040313','0403','arequipa','Arequipa','Caraveli','Yauca'),
('040401','0404','arequipa','Arequipa','Castilla','Aplao'),
('040402','0404','arequipa','Arequipa','Castilla','Andagua'),
('040403','0404','arequipa','Arequipa','Castilla','Ayo'),
('040404','0404','arequipa','Arequipa','Castilla','Chachas'),
('040405','0404','arequipa','Arequipa','Castilla','Chilcaymarca'),
('040406','0404','arequipa','Arequipa','Castilla','Choco'),
('040407','0404','arequipa','Arequipa','Castilla','Huancarqui'),
('040408','0404','arequipa','Arequipa','Castilla','Machaguay'),
('040409','0404','arequipa','Arequipa','Castilla','Orcopampa'),
('040410','0404','arequipa','Arequipa','Castilla','Pampacolca'),
('040411','0404','arequipa','Arequipa','Castilla','Tipan'),
('040412','0404','arequipa','Arequipa','Castilla','Uñon'),
('040413','0404','arequipa','Arequipa','Castilla','Uraca'),
('040414','0404','arequipa','Arequipa','Castilla','Viraco'),
('040501','0405','arequipa','Arequipa','Caylloma','Chivay'),
('040502','0405','arequipa','Arequipa','Caylloma','Achoma'),
('040503','0405','arequipa','Arequipa','Caylloma','Cabanaconde'),
('040504','0405','arequipa','Arequipa','Caylloma','Callalli'),
('040505','0405','arequipa','Arequipa','Caylloma','Caylloma'),
('040506','0405','arequipa','Arequipa','Caylloma','Coporaque'),
('040507','0405','arequipa','Arequipa','Caylloma','Huambo'),
('040508','0405','arequipa','Arequipa','Caylloma','Huanca'),
('040509','0405','arequipa','Arequipa','Caylloma','Ichupampa'),
('040510','0405','arequipa','Arequipa','Caylloma','Lari'),
('040511','0405','arequipa','Arequipa','Caylloma','Lluta'),
('040512','0405','arequipa','Arequipa','Caylloma','Maca'),
('040513','0405','arequipa','Arequipa','Caylloma','Madrigal'),
('040514','0405','arequipa','Arequipa','Caylloma','San Antonio de Chuca'),
('040515','0405','arequipa','Arequipa','Caylloma','Sibayo'),
('040516','0405','arequipa','Arequipa','Caylloma','Tapay'),
('040517','0405','arequipa','Arequipa','Caylloma','Tisco'),
('040518','0405','arequipa','Arequipa','Caylloma','Tuti'),
('040519','0405','arequipa','Arequipa','Caylloma','Yanque'),
('040520','0405','arequipa','Arequipa','Caylloma','Majes'),
('040601','0406','arequipa','Arequipa','Condesuyos','Chuquibamba'),
('040602','0406','arequipa','Arequipa','Condesuyos','Andaray'),
('040603','0406','arequipa','Arequipa','Condesuyos','Cayarani'),
('040604','0406','arequipa','Arequipa','Condesuyos','Chichas'),
('040605','0406','arequipa','Arequipa','Condesuyos','Iray'),
('040606','0406','arequipa','Arequipa','Condesuyos','Rio Grande'),
('040607','0406','arequipa','Arequipa','Condesuyos','Salamanca'),
('040608','0406','arequipa','Arequipa','Condesuyos','Yanaquihua'),
('040701','0407','arequipa','Arequipa','Islay','Mollendo'),
('040702','0407','arequipa','Arequipa','Islay','Cocachacra'),
('040703','0407','arequipa','Arequipa','Islay','Dean Valdivia'),
('040704','0407','arequipa','Arequipa','Islay','Islay'),
('040705','0407','arequipa','Arequipa','Islay','Mejia'),
('040706','0407','arequipa','Arequipa','Islay','Punta de Bombon'),
('040801','0408','arequipa','Arequipa','La Union','Cotahuasi'),
('040802','0408','arequipa','Arequipa','La Union','Alca'),
('040803','0408','arequipa','Arequipa','La Union','Charcana'),
('040804','0408','arequipa','Arequipa','La Union','Huaynacotas'),
('040805','0408','arequipa','Arequipa','La Union','Pampamarca'),
('040806','0408','arequipa','Arequipa','La Union','Puyca'),
('040807','0408','arequipa','Arequipa','La Union','Quechualla'),
('040808','0408','arequipa','Arequipa','La Union','Sayla'),
('040809','0408','arequipa','Arequipa','La Union','Tauria'),
('040810','0408','arequipa','Arequipa','La Union','Tomepampa'),
('040811','0408','arequipa','Arequipa','La Union','Toro'),
('050101','0501','ayacucho','Ayacucho','Huamanga','Ayacucho'),
('050102','0501','ayacucho','Ayacucho','Huamanga','Acocro'),
('050103','0501','ayacucho','Ayacucho','Huamanga','Acos Vinchos'),
('050104','0501','ayacucho','Ayacucho','Huamanga','Carmen Alto'),
('050105','0501','ayacucho','Ayacucho','Huamanga','Chiara'),
('050106','0501','ayacucho','Ayacucho','Huamanga','Ocros'),
('050107','0501','ayacucho','Ayacucho','Huamanga','Pacaycasa'),
('050108','0501','ayacucho','Ayacucho','Huamanga','Quinua'),
('050109','0501','ayacucho','Ayacucho','Huamanga','San Jose de Ticllas'),
('050110','0501','ayacucho','Ayacucho','Huamanga','San Juan Bautista'),
('050111','0501','ayacucho','Ayacucho','Huamanga','Santiago de Pischa'),
('050112','0501','ayacucho','Ayacucho','Huamanga','Socos'),
('050113','0501','ayacucho','Ayacucho','Huamanga','Tambillo'),
('050114','0501','ayacucho','Ayacucho','Huamanga','Vinchos'),
('050115','0501','ayacucho','Ayacucho','Huamanga','Jesus Nazareno'),
('050116','0501','ayacucho','Ayacucho','Huamanga','Andres Avelino Caceres Dorregaray'),
('050201','0502','ayacucho','Ayacucho','Cangallo','Cangallo'),
('050202','0502','ayacucho','Ayacucho','Cangallo','Chuschi'),
('050203','0502','ayacucho','Ayacucho','Cangallo','Los Morochucos'),
('050204','0502','ayacucho','Ayacucho','Cangallo','Maria Parado de Bellido'),
('050205','0502','ayacucho','Ayacucho','Cangallo','Paras'),
('050206','0502','ayacucho','Ayacucho','Cangallo','Totos'),
('050301','0503','ayacucho','Ayacucho','Huanca Sancos','Sancos'),
('050302','0503','ayacucho','Ayacucho','Huanca Sancos','Carapo'),
('050303','0503','ayacucho','Ayacucho','Huanca Sancos','Sacsamarca'),
('050304','0503','ayacucho','Ayacucho','Huanca Sancos','Santiago de Lucanamarca'),
('050401','0504','ayacucho','Ayacucho','Huanta','Huanta'),
('050402','0504','ayacucho','Ayacucho','Huanta','Ayahuanco'),
('050403','0504','ayacucho','Ayacucho','Huanta','Huamanguilla'),
('050404','0504','ayacucho','Ayacucho','Huanta','Iguain'),
('050405','0504','ayacucho','Ayacucho','Huanta','Luricocha'),
('050406','0504','ayacucho','Ayacucho','Huanta','Santillana'),
('050407','0504','ayacucho','Ayacucho','Huanta','Sivia'),
('050408','0504','ayacucho','Ayacucho','Huanta','Llochegua'),
('050409','0504','ayacucho','Ayacucho','Huanta','Canayre'),
('050410','0504','ayacucho','Ayacucho','Huanta','Uchuraccay'),
('050411','0504','ayacucho','Ayacucho','Huanta','Pucacolpa'),
('050412','0504','ayacucho','Ayacucho','Huanta','Chaca'),
('050413','0504','ayacucho','Ayacucho','Huanta','Putis'),
('050501','0505','ayacucho','Ayacucho','La Mar','San Miguel'),
('050502','0505','ayacucho','Ayacucho','La Mar','Anco'),
('050503','0505','ayacucho','Ayacucho','La Mar','Ayna'),
('050504','0505','ayacucho','Ayacucho','La Mar','Chilcas'),
('050505','0505','ayacucho','Ayacucho','La Mar','Chungui'),
('050506','0505','ayacucho','Ayacucho','La Mar','Luis Carranza'),
('050507','0505','ayacucho','Ayacucho','La Mar','Santa Rosa'),
('050508','0505','ayacucho','Ayacucho','La Mar','Tambo'),
('050509','0505','ayacucho','Ayacucho','La Mar','Samugari'),
('050510','0505','ayacucho','Ayacucho','La Mar','Anchihuay'),
('050511','0505','ayacucho','Ayacucho','La Mar','Oronccoy'),
('050512','0505','ayacucho','Ayacucho','La Mar','Union Progreso'),
('050513','0505','ayacucho','Ayacucho','La Mar','Rio Magdalena'),
('050514','0505','ayacucho','Ayacucho','La Mar','Ninabamba'),
('050515','0505','ayacucho','Ayacucho','La Mar','Patibamba'),
('050601','0506','ayacucho','Ayacucho','Lucanas','Puquio'),
('050602','0506','ayacucho','Ayacucho','Lucanas','Aucara'),
('050603','0506','ayacucho','Ayacucho','Lucanas','Cabana'),
('050604','0506','ayacucho','Ayacucho','Lucanas','Carmen Salcedo'),
('050605','0506','ayacucho','Ayacucho','Lucanas','Chaviña'),
('050606','0506','ayacucho','Ayacucho','Lucanas','Chipao'),
('050607','0506','ayacucho','Ayacucho','Lucanas','Huac-huas'),
('050608','0506','ayacucho','Ayacucho','Lucanas','Laramate'),
('050609','0506','ayacucho','Ayacucho','Lucanas','Leoncio Prado'),
('050610','0506','ayacucho','Ayacucho','Lucanas','Llauta'),
('050611','0506','ayacucho','Ayacucho','Lucanas','Lucanas'),
('050612','0506','ayacucho','Ayacucho','Lucanas','Ocaña'),
('050613','0506','ayacucho','Ayacucho','Lucanas','Otoca'),
('050614','0506','ayacucho','Ayacucho','Lucanas','Saisa'),
('050615','0506','ayacucho','Ayacucho','Lucanas','San Cristobal'),
('050616','0506','ayacucho','Ayacucho','Lucanas','San Juan'),
('050617','0506','ayacucho','Ayacucho','Lucanas','San Pedro'),
('050618','0506','ayacucho','Ayacucho','Lucanas','San Pedro de Palco'),
('050619','0506','ayacucho','Ayacucho','Lucanas','Sancos'),
('050620','0506','ayacucho','Ayacucho','Lucanas','Santa Ana de Huaycahuacho'),
('050621','0506','ayacucho','Ayacucho','Lucanas','Santa Lucia'),
('050701','0507','ayacucho','Ayacucho','Parinacochas','Coracora'),
('050702','0507','ayacucho','Ayacucho','Parinacochas','Chumpi'),
('050703','0507','ayacucho','Ayacucho','Parinacochas','Coronel Castañeda'),
('050704','0507','ayacucho','Ayacucho','Parinacochas','Pacapausa'),
('050705','0507','ayacucho','Ayacucho','Parinacochas','Pullo'),
('050706','0507','ayacucho','Ayacucho','Parinacochas','Puyusca'),
('050707','0507','ayacucho','Ayacucho','Parinacochas','San Francisco de Rivacayco'),
('050708','0507','ayacucho','Ayacucho','Parinacochas','Upahuacho'),
('050801','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Pausa'),
('050802','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Colta'),
('050803','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Corculla'),
('050804','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Lampa'),
('050805','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Marcabamba'),
('050806','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Oyolo'),
('050807','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Pararca'),
('050808','0508','ayacucho','Ayacucho','Paucar del Sara Sara','San Javier de Alpabamba'),
('050809','0508','ayacucho','Ayacucho','Paucar del Sara Sara','San Jose de Ushua'),
('050810','0508','ayacucho','Ayacucho','Paucar del Sara Sara','Sara Sara'),
('050901','0509','ayacucho','Ayacucho','Sucre','Querobamba'),
('050902','0509','ayacucho','Ayacucho','Sucre','Belen'),
('050903','0509','ayacucho','Ayacucho','Sucre','Chalcos'),
('050904','0509','ayacucho','Ayacucho','Sucre','Chilcayoc'),
('050905','0509','ayacucho','Ayacucho','Sucre','Huacaña'),
('050906','0509','ayacucho','Ayacucho','Sucre','Morcolla'),
('050907','0509','ayacucho','Ayacucho','Sucre','Paico'),
('050908','0509','ayacucho','Ayacucho','Sucre','San Pedro de Larcay'),
('050909','0509','ayacucho','Ayacucho','Sucre','San Salvador de Quije'),
('050910','0509','ayacucho','Ayacucho','Sucre','Santiago de Paucaray'),
('050911','0509','ayacucho','Ayacucho','Sucre','Soras'),
('051001','0510','ayacucho','Ayacucho','Victor Fajardo','Huancapi'),
('051002','0510','ayacucho','Ayacucho','Victor Fajardo','Alcamenca'),
('051003','0510','ayacucho','Ayacucho','Victor Fajardo','Apongo'),
('051004','0510','ayacucho','Ayacucho','Victor Fajardo','Asquipata'),
('051005','0510','ayacucho','Ayacucho','Victor Fajardo','Canaria'),
('051006','0510','ayacucho','Ayacucho','Victor Fajardo','Cayara'),
('051007','0510','ayacucho','Ayacucho','Victor Fajardo','Colca'),
('051008','0510','ayacucho','Ayacucho','Victor Fajardo','Huamanquiquia'),
('051009','0510','ayacucho','Ayacucho','Victor Fajardo','Huancaraylla'),
('051010','0510','ayacucho','Ayacucho','Victor Fajardo','Hualla'),
('051011','0510','ayacucho','Ayacucho','Victor Fajardo','Sarhua'),
('051012','0510','ayacucho','Ayacucho','Victor Fajardo','Vilcanchos'),
('051101','0511','ayacucho','Ayacucho','Vilcas Huaman','Vilcas Huaman'),
('051102','0511','ayacucho','Ayacucho','Vilcas Huaman','Accomarca'),
('051103','0511','ayacucho','Ayacucho','Vilcas Huaman','Carhuanca'),
('051104','0511','ayacucho','Ayacucho','Vilcas Huaman','Concepcion'),
('051105','0511','ayacucho','Ayacucho','Vilcas Huaman','Huambalpa'),
('051106','0511','ayacucho','Ayacucho','Vilcas Huaman','Independencia'),
('051107','0511','ayacucho','Ayacucho','Vilcas Huaman','Saurama'),
('051108','0511','ayacucho','Ayacucho','Vilcas Huaman','Vischongo'),
('060101','0601','cajamarca','Cajamarca','Cajamarca','Cajamarca'),
('060102','0601','cajamarca','Cajamarca','Cajamarca','Asuncion'),
('060103','0601','cajamarca','Cajamarca','Cajamarca','Chetilla'),
('060104','0601','cajamarca','Cajamarca','Cajamarca','Cospan'),
('060105','0601','cajamarca','Cajamarca','Cajamarca','Encañada'),
('060106','0601','cajamarca','Cajamarca','Cajamarca','Jesus'),
('060107','0601','cajamarca','Cajamarca','Cajamarca','Llacanora'),
('060108','0601','cajamarca','Cajamarca','Cajamarca','Los Baños del Inca'),
('060109','0601','cajamarca','Cajamarca','Cajamarca','Magdalena'),
('060110','0601','cajamarca','Cajamarca','Cajamarca','Matara'),
('060111','0601','cajamarca','Cajamarca','Cajamarca','Namora'),
('060112','0601','cajamarca','Cajamarca','Cajamarca','San Juan'),
('060201','0602','cajamarca','Cajamarca','Cajabamba','Cajabamba'),
('060202','0602','cajamarca','Cajamarca','Cajabamba','Cachachi'),
('060203','0602','cajamarca','Cajamarca','Cajabamba','Condebamba'),
('060204','0602','cajamarca','Cajamarca','Cajabamba','Sitacocha'),
('060301','0603','cajamarca','Cajamarca','Celendin','Celendin'),
('060302','0603','cajamarca','Cajamarca','Celendin','Chumuch'),
('060303','0603','cajamarca','Cajamarca','Celendin','Cortegana'),
('060304','0603','cajamarca','Cajamarca','Celendin','Huasmin'),
('060305','0603','cajamarca','Cajamarca','Celendin','Jorge Chavez'),
('060306','0603','cajamarca','Cajamarca','Celendin','Jose Galvez'),
('060307','0603','cajamarca','Cajamarca','Celendin','Miguel Iglesias'),
('060308','0603','cajamarca','Cajamarca','Celendin','Oxamarca'),
('060309','0603','cajamarca','Cajamarca','Celendin','Sorochuco'),
('060310','0603','cajamarca','Cajamarca','Celendin','Sucre'),
('060311','0603','cajamarca','Cajamarca','Celendin','Utco'),
('060312','0603','cajamarca','Cajamarca','Celendin','La Libertad de Pallan'),
('060401','0604','cajamarca','Cajamarca','Chota','Chota'),
('060402','0604','cajamarca','Cajamarca','Chota','Anguia'),
('060403','0604','cajamarca','Cajamarca','Chota','Chadin'),
('060404','0604','cajamarca','Cajamarca','Chota','Chiguirip'),
('060405','0604','cajamarca','Cajamarca','Chota','Chimban'),
('060406','0604','cajamarca','Cajamarca','Chota','Choropampa'),
('060407','0604','cajamarca','Cajamarca','Chota','Cochabamba'),
('060408','0604','cajamarca','Cajamarca','Chota','Conchan'),
('060409','0604','cajamarca','Cajamarca','Chota','Huambos'),
('060410','0604','cajamarca','Cajamarca','Chota','Lajas'),
('060411','0604','cajamarca','Cajamarca','Chota','Llama'),
('060412','0604','cajamarca','Cajamarca','Chota','Miracosta'),
('060413','0604','cajamarca','Cajamarca','Chota','Paccha'),
('060414','0604','cajamarca','Cajamarca','Chota','Pion'),
('060415','0604','cajamarca','Cajamarca','Chota','Querocoto'),
('060416','0604','cajamarca','Cajamarca','Chota','San Juan de Licupis'),
('060417','0604','cajamarca','Cajamarca','Chota','Tacabamba'),
('060418','0604','cajamarca','Cajamarca','Chota','Tocmoche'),
('060419','0604','cajamarca','Cajamarca','Chota','Chalamarca'),
('060501','0605','cajamarca','Cajamarca','Contumaza','Contumaza'),
('060502','0605','cajamarca','Cajamarca','Contumaza','Chilete'),
('060503','0605','cajamarca','Cajamarca','Contumaza','Cupisnique'),
('060504','0605','cajamarca','Cajamarca','Contumaza','Guzmango'),
('060505','0605','cajamarca','Cajamarca','Contumaza','San Benito'),
('060506','0605','cajamarca','Cajamarca','Contumaza','Santa Cruz de Toled'),
('060507','0605','cajamarca','Cajamarca','Contumaza','Tantarica'),
('060508','0605','cajamarca','Cajamarca','Contumaza','Yonan'),
('060601','0606','cajamarca','Cajamarca','Cutervo','Cutervo'),
('060602','0606','cajamarca','Cajamarca','Cutervo','Callayuc'),
('060603','0606','cajamarca','Cajamarca','Cutervo','Choros'),
('060604','0606','cajamarca','Cajamarca','Cutervo','Cujillo'),
('060605','0606','cajamarca','Cajamarca','Cutervo','La Ramada'),
('060606','0606','cajamarca','Cajamarca','Cutervo','Pimpingos'),
('060607','0606','cajamarca','Cajamarca','Cutervo','Querocotillo'),
('060608','0606','cajamarca','Cajamarca','Cutervo','San Andres de Cutervo'),
('060609','0606','cajamarca','Cajamarca','Cutervo','San Juan de Cutervo'),
('060610','0606','cajamarca','Cajamarca','Cutervo','San Luis de Lucma'),
('060611','0606','cajamarca','Cajamarca','Cutervo','Santa Cruz'),
('060612','0606','cajamarca','Cajamarca','Cutervo','Santo Domingo de la Capilla'),
('060613','0606','cajamarca','Cajamarca','Cutervo','Santo Tomas'),
('060614','0606','cajamarca','Cajamarca','Cutervo','Socota'),
('060615','0606','cajamarca','Cajamarca','Cutervo','Toribio Casanova'),
('060701','0607','cajamarca','Cajamarca','Hualgayoc','Bambamarca'),
('060702','0607','cajamarca','Cajamarca','Hualgayoc','Chugur'),
('060703','0607','cajamarca','Cajamarca','Hualgayoc','Hualgayoc'),
('060801','0608','cajamarca','Cajamarca','Jaen','Jaen'),
('060802','0608','cajamarca','Cajamarca','Jaen','Bellavista'),
('060803','0608','cajamarca','Cajamarca','Jaen','Chontali'),
('060804','0608','cajamarca','Cajamarca','Jaen','Colasay'),
('060805','0608','cajamarca','Cajamarca','Jaen','Huabal'),
('060806','0608','cajamarca','Cajamarca','Jaen','Las Pirias'),
('060807','0608','cajamarca','Cajamarca','Jaen','Pomahuaca'),
('060808','0608','cajamarca','Cajamarca','Jaen','Pucara'),
('060809','0608','cajamarca','Cajamarca','Jaen','Sallique'),
('060810','0608','cajamarca','Cajamarca','Jaen','San Felipe'),
('060811','0608','cajamarca','Cajamarca','Jaen','San Jose del Alto'),
('060812','0608','cajamarca','Cajamarca','Jaen','Santa Rosa'),
('060901','0609','cajamarca','Cajamarca','San Ignacio','San Ignacio'),
('060902','0609','cajamarca','Cajamarca','San Ignacio','Chirinos'),
('060903','0609','cajamarca','Cajamarca','San Ignacio','Huarango'),
('060904','0609','cajamarca','Cajamarca','San Ignacio','La Coipa'),
('060905','0609','cajamarca','Cajamarca','San Ignacio','Namballe'),
('060906','0609','cajamarca','Cajamarca','San Ignacio','San Jose de Lourdes'),
('060907','0609','cajamarca','Cajamarca','San Ignacio','Tabaconas'),
('061001','0610','cajamarca','Cajamarca','San Marcos','Pedro Galvez'),
('061002','0610','cajamarca','Cajamarca','San Marcos','Chancay'),
('061003','0610','cajamarca','Cajamarca','San Marcos','Eduardo Villanueva'),
('061004','0610','cajamarca','Cajamarca','San Marcos','Gregorio Pita'),
('061005','0610','cajamarca','Cajamarca','San Marcos','Ichocan'),
('061006','0610','cajamarca','Cajamarca','San Marcos','Jose Manuel Quiroz'),
('061007','0610','cajamarca','Cajamarca','San Marcos','Jose Sabogal'),
('061101','0611','cajamarca','Cajamarca','San Miguel','San Miguel'),
('061102','0611','cajamarca','Cajamarca','San Miguel','Bolivar'),
('061103','0611','cajamarca','Cajamarca','San Miguel','Calquis'),
('061104','0611','cajamarca','Cajamarca','San Miguel','Catilluc'),
('061105','0611','cajamarca','Cajamarca','San Miguel','El Prado'),
('061106','0611','cajamarca','Cajamarca','San Miguel','La Florida'),
('061107','0611','cajamarca','Cajamarca','San Miguel','Llapa'),
('061108','0611','cajamarca','Cajamarca','San Miguel','Nanchoc'),
('061109','0611','cajamarca','Cajamarca','San Miguel','Niepos'),
('061110','0611','cajamarca','Cajamarca','San Miguel','San Gregorio'),
('061111','0611','cajamarca','Cajamarca','San Miguel','San Silvestre de Cochan'),
('061112','0611','cajamarca','Cajamarca','San Miguel','Tongod'),
('061113','0611','cajamarca','Cajamarca','San Miguel','Union Agua Blanca'),
('061201','0612','cajamarca','Cajamarca','San Pablo','San Pablo'),
('061202','0612','cajamarca','Cajamarca','San Pablo','San Bernardino'),
('061203','0612','cajamarca','Cajamarca','San Pablo','San Luis'),
('061204','0612','cajamarca','Cajamarca','San Pablo','Tumbaden'),
('061301','0613','cajamarca','Cajamarca','Santa Cruz','Santa Cruz'),
('061302','0613','cajamarca','Cajamarca','Santa Cruz','Andabamba'),
('061303','0613','cajamarca','Cajamarca','Santa Cruz','Catache'),
('061304','0613','cajamarca','Cajamarca','Santa Cruz','Chancaybaños'),
('061305','0613','cajamarca','Cajamarca','Santa Cruz','La Esperanza'),
('061306','0613','cajamarca','Cajamarca','Santa Cruz','Ninabamba'),
('061307','0613','cajamarca','Cajamarca','Santa Cruz','Pulan'),
('061308','0613','cajamarca','Cajamarca','Santa Cruz','Saucepampa'),
('061309','0613','cajamarca','Cajamarca','Santa Cruz','Sexi'),
('061310','0613','cajamarca','Cajamarca','Santa Cruz','Uticyacu'),
('061311','0613','cajamarca','Cajamarca','Santa Cruz','Yauyucan'),
('070101','0701','callao','Callao','Callao','Callao'),
('070102','0701','callao','Callao','Callao','Bellavista'),
('070103','0701','callao','Callao','Callao','Carmen de la Legua Reynoso'),
('070104','0701','callao','Callao','Callao','La Perla'),
('070105','0701','callao','Callao','Callao','La Punta'),
('070106','0701','callao','Callao','Callao','Ventanilla'),
('070107','0701','callao','Callao','Callao','Mi Peru'),
('080101','0801','cusco','Cusco','Cusco','Cusco'),
('080102','0801','cusco','Cusco','Cusco','Ccorca'),
('080103','0801','cusco','Cusco','Cusco','Poroy'),
('080104','0801','cusco','Cusco','Cusco','San Jeronimo'),
('080105','0801','cusco','Cusco','Cusco','San Sebastian'),
('080106','0801','cusco','Cusco','Cusco','Santiago'),
('080107','0801','cusco','Cusco','Cusco','Saylla'),
('080108','0801','cusco','Cusco','Cusco','Wanchaq'),
('080201','0802','cusco','Cusco','Acomayo','Acomayo'),
('080202','0802','cusco','Cusco','Acomayo','Acopia'),
('080203','0802','cusco','Cusco','Acomayo','Acos'),
('080204','0802','cusco','Cusco','Acomayo','Mosoc Llacta'),
('080205','0802','cusco','Cusco','Acomayo','Pomacanchi'),
('080206','0802','cusco','Cusco','Acomayo','Rondocan'),
('080207','0802','cusco','Cusco','Acomayo','Sangarara'),
('080301','0803','cusco','Cusco','Anta','Anta'),
('080302','0803','cusco','Cusco','Anta','Ancahuasi'),
('080303','0803','cusco','Cusco','Anta','Cachimayo'),
('080304','0803','cusco','Cusco','Anta','Chinchaypujio'),
('080305','0803','cusco','Cusco','Anta','Huarocondo'),
('080306','0803','cusco','Cusco','Anta','Limatambo'),
('080307','0803','cusco','Cusco','Anta','Mollepata'),
('080308','0803','cusco','Cusco','Anta','Pucyura'),
('080309','0803','cusco','Cusco','Anta','Zurite'),
('080401','0804','cusco','Cusco','Calca','Calca'),
('080402','0804','cusco','Cusco','Calca','Coya'),
('080403','0804','cusco','Cusco','Calca','Lamay'),
('080404','0804','cusco','Cusco','Calca','Lares'),
('080405','0804','cusco','Cusco','Calca','Pisac'),
('080406','0804','cusco','Cusco','Calca','San Salvador'),
('080407','0804','cusco','Cusco','Calca','Taray'),
('080408','0804','cusco','Cusco','Calca','Yanatile'),
('080501','0805','cusco','Cusco','Canas','Yanaoca'),
('080502','0805','cusco','Cusco','Canas','Checca'),
('080503','0805','cusco','Cusco','Canas','Kunturkanki'),
('080504','0805','cusco','Cusco','Canas','Langui'),
('080505','0805','cusco','Cusco','Canas','Layo'),
('080506','0805','cusco','Cusco','Canas','Pampamarca'),
('080507','0805','cusco','Cusco','Canas','Quehue'),
('080508','0805','cusco','Cusco','Canas','Tupac Amaru'),
('080601','0806','cusco','Cusco','Canchis','Sicuani'),
('080602','0806','cusco','Cusco','Canchis','Checacupe'),
('080603','0806','cusco','Cusco','Canchis','Combapata'),
('080604','0806','cusco','Cusco','Canchis','Marangani'),
('080605','0806','cusco','Cusco','Canchis','Pitumarca'),
('080606','0806','cusco','Cusco','Canchis','San Pablo'),
('080607','0806','cusco','Cusco','Canchis','San Pedro'),
('080608','0806','cusco','Cusco','Canchis','Tinta'),
('080701','0807','cusco','Cusco','Chumbivilcas','Santo Tomas'),
('080702','0807','cusco','Cusco','Chumbivilcas','Capacmarca'),
('080703','0807','cusco','Cusco','Chumbivilcas','Chamaca'),
('080704','0807','cusco','Cusco','Chumbivilcas','Colquemarca'),
('080705','0807','cusco','Cusco','Chumbivilcas','Livitaca'),
('080706','0807','cusco','Cusco','Chumbivilcas','Llusco'),
('080707','0807','cusco','Cusco','Chumbivilcas','Quiñota'),
('080708','0807','cusco','Cusco','Chumbivilcas','Velille'),
('080801','0808','cusco','Cusco','Espinar','Espinar'),
('080802','0808','cusco','Cusco','Espinar','Condoroma'),
('080803','0808','cusco','Cusco','Espinar','Coporaque'),
('080804','0808','cusco','Cusco','Espinar','Ocoruro'),
('080805','0808','cusco','Cusco','Espinar','Pallpata'),
('080806','0808','cusco','Cusco','Espinar','Pichigua'),
('080807','0808','cusco','Cusco','Espinar','Suyckutambo'),
('080808','0808','cusco','Cusco','Espinar','Alto Pichigua'),
('080901','0809','cusco','Cusco','La Convencion','Santa Ana'),
('080902','0809','cusco','Cusco','La Convencion','Echarate'),
('080903','0809','cusco','Cusco','La Convencion','Huayopata'),
('080904','0809','cusco','Cusco','La Convencion','Maranura'),
('080905','0809','cusco','Cusco','La Convencion','Ocobamba'),
('080906','0809','cusco','Cusco','La Convencion','Quellouno'),
('080907','0809','cusco','Cusco','La Convencion','Kimbiri'),
('080908','0809','cusco','Cusco','La Convencion','Santa Teresa'),
('080909','0809','cusco','Cusco','La Convencion','Vilcabamba'),
('080910','0809','cusco','Cusco','La Convencion','Pichari'),
('080911','0809','cusco','Cusco','La Convencion','Inkawasi'),
('080912','0809','cusco','Cusco','La Convencion','Villa Virgen'),
('080913','0809','cusco','Cusco','La Convencion','Villa Kintiarina'),
('080914','0809','cusco','Cusco','La Convencion','Megantoni'),
('080915','0809','cusco','Cusco','La Convencion','Kumpirushiato'),
('080916','0809','cusco','Cusco','La Convencion','Cielo Punco'),
('080917','0809','cusco','Cusco','La Convencion','Manitea'),
('080918','0809','cusco','Cusco','La Convencion','Union Ashaninka'),
('081001','0810','cusco','Cusco','Paruro','Paruro'),
('081002','0810','cusco','Cusco','Paruro','Accha'),
('081003','0810','cusco','Cusco','Paruro','Ccapi'),
('081004','0810','cusco','Cusco','Paruro','Colcha'),
('081005','0810','cusco','Cusco','Paruro','Huanoquite'),
('081006','0810','cusco','Cusco','Paruro','Omacha'),
('081007','0810','cusco','Cusco','Paruro','Paccaritambo'),
('081008','0810','cusco','Cusco','Paruro','Pillpinto'),
('081009','0810','cusco','Cusco','Paruro','Yaurisque'),
('081101','0811','cusco','Cusco','Paucartambo','Paucartambo'),
('081102','0811','cusco','Cusco','Paucartambo','Caicay'),
('081103','0811','cusco','Cusco','Paucartambo','Challabamba'),
('081104','0811','cusco','Cusco','Paucartambo','Colquepata'),
('081105','0811','cusco','Cusco','Paucartambo','Huancarani'),
('081106','0811','cusco','Cusco','Paucartambo','Kosñipata'),
('081201','0812','cusco','Cusco','Quispicanchi','Urcos'),
('081202','0812','cusco','Cusco','Quispicanchi','Andahuaylillas'),
('081203','0812','cusco','Cusco','Quispicanchi','Camanti'),
('081204','0812','cusco','Cusco','Quispicanchi','Ccarhuayo'),
('081205','0812','cusco','Cusco','Quispicanchi','Ccatca'),
('081206','0812','cusco','Cusco','Quispicanchi','Cusipata'),
('081207','0812','cusco','Cusco','Quispicanchi','Huaro'),
('081208','0812','cusco','Cusco','Quispicanchi','Lucre'),
('081209','0812','cusco','Cusco','Quispicanchi','Marcapata'),
('081210','0812','cusco','Cusco','Quispicanchi','Ocongate'),
('081211','0812','cusco','Cusco','Quispicanchi','Oropesa'),
('081212','0812','cusco','Cusco','Quispicanchi','Quiquijana'),
('081301','0813','cusco','Cusco','Urubamba','Urubamba'),
('081302','0813','cusco','Cusco','Urubamba','Chinchero'),
('081303','0813','cusco','Cusco','Urubamba','Huayllabamba'),
('081304','0813','cusco','Cusco','Urubamba','Machupicchu'),
('081305','0813','cusco','Cusco','Urubamba','Maras'),
('081306','0813','cusco','Cusco','Urubamba','Ollantaytambo'),
('081307','0813','cusco','Cusco','Urubamba','Yucay'),
('090101','0901','huancavelica','Huancavelica','Huancavelica','Huancavelica'),
('090102','0901','huancavelica','Huancavelica','Huancavelica','Acobambilla'),
('090103','0901','huancavelica','Huancavelica','Huancavelica','Acoria'),
('090104','0901','huancavelica','Huancavelica','Huancavelica','Conayca'),
('090105','0901','huancavelica','Huancavelica','Huancavelica','Cuenca'),
('090106','0901','huancavelica','Huancavelica','Huancavelica','Huachocolpa'),
('090107','0901','huancavelica','Huancavelica','Huancavelica','Huayllahuara'),
('090108','0901','huancavelica','Huancavelica','Huancavelica','Izcuchaca'),
('090109','0901','huancavelica','Huancavelica','Huancavelica','Laria'),
('090110','0901','huancavelica','Huancavelica','Huancavelica','Manta'),
('090111','0901','huancavelica','Huancavelica','Huancavelica','Mariscal Caceres'),
('090112','0901','huancavelica','Huancavelica','Huancavelica','Moya'),
('090113','0901','huancavelica','Huancavelica','Huancavelica','Nuevo Occoro'),
('090114','0901','huancavelica','Huancavelica','Huancavelica','Palca'),
('090115','0901','huancavelica','Huancavelica','Huancavelica','Pilchaca'),
('090116','0901','huancavelica','Huancavelica','Huancavelica','Vilca'),
('090117','0901','huancavelica','Huancavelica','Huancavelica','Yauli'),
('090118','0901','huancavelica','Huancavelica','Huancavelica','Ascension'),
('090119','0901','huancavelica','Huancavelica','Huancavelica','Huando'),
('090201','0902','huancavelica','Huancavelica','Acobamba','Acobamba'),
('090202','0902','huancavelica','Huancavelica','Acobamba','Andabamba'),
('090203','0902','huancavelica','Huancavelica','Acobamba','Anta'),
('090204','0902','huancavelica','Huancavelica','Acobamba','Caja'),
('090205','0902','huancavelica','Huancavelica','Acobamba','Marcas'),
('090206','0902','huancavelica','Huancavelica','Acobamba','Paucara'),
('090207','0902','huancavelica','Huancavelica','Acobamba','Pomacocha'),
('090208','0902','huancavelica','Huancavelica','Acobamba','Rosario'),
('090301','0903','huancavelica','Huancavelica','Angaraes','Lircay'),
('090302','0903','huancavelica','Huancavelica','Angaraes','Anchonga'),
('090303','0903','huancavelica','Huancavelica','Angaraes','Callanmarca'),
('090304','0903','huancavelica','Huancavelica','Angaraes','Ccochaccasa'),
('090305','0903','huancavelica','Huancavelica','Angaraes','Chincho'),
('090306','0903','huancavelica','Huancavelica','Angaraes','Congalla'),
('090307','0903','huancavelica','Huancavelica','Angaraes','Huanca-huanca'),
('090308','0903','huancavelica','Huancavelica','Angaraes','Huayllay Grande'),
('090309','0903','huancavelica','Huancavelica','Angaraes','Julcamarca'),
('090310','0903','huancavelica','Huancavelica','Angaraes','San Antonio de Antaparco'),
('090311','0903','huancavelica','Huancavelica','Angaraes','Santo Tomas de Pata'),
('090312','0903','huancavelica','Huancavelica','Angaraes','Secclla'),
('090401','0904','huancavelica','Huancavelica','Castrovirreyna','Castrovirreyna'),
('090402','0904','huancavelica','Huancavelica','Castrovirreyna','Arma'),
('090403','0904','huancavelica','Huancavelica','Castrovirreyna','Aurahua'),
('090404','0904','huancavelica','Huancavelica','Castrovirreyna','Capillas'),
('090405','0904','huancavelica','Huancavelica','Castrovirreyna','Chupamarca'),
('090406','0904','huancavelica','Huancavelica','Castrovirreyna','Cocas'),
('090407','0904','huancavelica','Huancavelica','Castrovirreyna','Huachos'),
('090408','0904','huancavelica','Huancavelica','Castrovirreyna','Huamatambo'),
('090409','0904','huancavelica','Huancavelica','Castrovirreyna','Mollepampa'),
('090410','0904','huancavelica','Huancavelica','Castrovirreyna','San Juan'),
('090411','0904','huancavelica','Huancavelica','Castrovirreyna','Santa Ana'),
('090412','0904','huancavelica','Huancavelica','Castrovirreyna','Tantara'),
('090413','0904','huancavelica','Huancavelica','Castrovirreyna','Ticrapo'),
('090501','0905','huancavelica','Huancavelica','Churcampa','Churcampa'),
('090502','0905','huancavelica','Huancavelica','Churcampa','Anco'),
('090503','0905','huancavelica','Huancavelica','Churcampa','Chinchihuasi'),
('090504','0905','huancavelica','Huancavelica','Churcampa','El Carmen'),
('090505','0905','huancavelica','Huancavelica','Churcampa','La Merced'),
('090506','0905','huancavelica','Huancavelica','Churcampa','Locroja'),
('090507','0905','huancavelica','Huancavelica','Churcampa','Paucarbamba'),
('090508','0905','huancavelica','Huancavelica','Churcampa','San Miguel de Mayocc'),
('090509','0905','huancavelica','Huancavelica','Churcampa','San Pedro de Coris'),
('090510','0905','huancavelica','Huancavelica','Churcampa','Pachamarca'),
('090511','0905','huancavelica','Huancavelica','Churcampa','Cosme'),
('090601','0906','huancavelica','Huancavelica','Huaytara','Huaytara'),
('090602','0906','huancavelica','Huancavelica','Huaytara','Ayavi'),
('090603','0906','huancavelica','Huancavelica','Huaytara','Cordova'),
('090604','0906','huancavelica','Huancavelica','Huaytara','Huayacundo Arma'),
('090605','0906','huancavelica','Huancavelica','Huaytara','Laramarca'),
('090606','0906','huancavelica','Huancavelica','Huaytara','Ocoyo'),
('090607','0906','huancavelica','Huancavelica','Huaytara','Pilpichaca'),
('090608','0906','huancavelica','Huancavelica','Huaytara','Querco'),
('090609','0906','huancavelica','Huancavelica','Huaytara','Quito-arma'),
('090610','0906','huancavelica','Huancavelica','Huaytara','San Antonio de Cusicancha'),
('090611','0906','huancavelica','Huancavelica','Huaytara','San Francisco de Sangayaico'),
('090612','0906','huancavelica','Huancavelica','Huaytara','San Isidro'),
('090613','0906','huancavelica','Huancavelica','Huaytara','Santiago de Chocorvos'),
('090614','0906','huancavelica','Huancavelica','Huaytara','Santiago de Quirahuara'),
('090615','0906','huancavelica','Huancavelica','Huaytara','Santo Domingo de Capillas'),
('090616','0906','huancavelica','Huancavelica','Huaytara','Tambo'),
('090701','0907','huancavelica','Huancavelica','Tayacaja','Pampas'),
('090702','0907','huancavelica','Huancavelica','Tayacaja','Acostambo'),
('090703','0907','huancavelica','Huancavelica','Tayacaja','Acraquia'),
('090704','0907','huancavelica','Huancavelica','Tayacaja','Ahuaycha'),
('090705','0907','huancavelica','Huancavelica','Tayacaja','Colcabamba'),
('090706','0907','huancavelica','Huancavelica','Tayacaja','Daniel Hernandez'),
('090707','0907','huancavelica','Huancavelica','Tayacaja','Huachocolpa'),
('090709','0907','huancavelica','Huancavelica','Tayacaja','Huaribamba'),
('090710','0907','huancavelica','Huancavelica','Tayacaja','Ñahuimpuquio'),
('090711','0907','huancavelica','Huancavelica','Tayacaja','Pazos'),
('090713','0907','huancavelica','Huancavelica','Tayacaja','Quishuar'),
('090714','0907','huancavelica','Huancavelica','Tayacaja','Salcabamba'),
('090715','0907','huancavelica','Huancavelica','Tayacaja','Salcahuasi'),
('090716','0907','huancavelica','Huancavelica','Tayacaja','San Marcos de Rocchac'),
('090717','0907','huancavelica','Huancavelica','Tayacaja','Surcubamba'),
('090718','0907','huancavelica','Huancavelica','Tayacaja','Tintay Puncu'),
('090719','0907','huancavelica','Huancavelica','Tayacaja','Quichuas'),
('090720','0907','huancavelica','Huancavelica','Tayacaja','Andaymarca'),
('090721','0907','huancavelica','Huancavelica','Tayacaja','Roble'),
('090722','0907','huancavelica','Huancavelica','Tayacaja','Pichos'),
('090723','0907','huancavelica','Huancavelica','Tayacaja','Santiago de Tucuma'),
('090724','0907','huancavelica','Huancavelica','Tayacaja','Lambras'),
('090725','0907','huancavelica','Huancavelica','Tayacaja','Cochabamba'),
('100101','1001','huanuco','Huánuco','Huánuco','Huánuco'),
('100102','1001','huanuco','Huánuco','Huánuco','Amarilis'),
('100103','1001','huanuco','Huánuco','Huánuco','Chinchao'),
('100104','1001','huanuco','Huánuco','Huánuco','Churubamba'),
('100105','1001','huanuco','Huánuco','Huánuco','Margos'),
('100106','1001','huanuco','Huánuco','Huánuco','Quisqui (kichki)'),
('100107','1001','huanuco','Huánuco','Huánuco','San Francisco de Cayran'),
('100108','1001','huanuco','Huánuco','Huánuco','San Pedro de Chaulan'),
('100109','1001','huanuco','Huánuco','Huánuco','Santa Maria del Valle'),
('100110','1001','huanuco','Huánuco','Huánuco','Yarumayo'),
('100111','1001','huanuco','Huánuco','Huánuco','Pillco Marca'),
('100112','1001','huanuco','Huánuco','Huánuco','Yacus'),
('100113','1001','huanuco','Huánuco','Huánuco','San Pablo de Pillao'),
('100201','1002','huanuco','Huánuco','Ambo','Ambo'),
('100202','1002','huanuco','Huánuco','Ambo','Cayna'),
('100203','1002','huanuco','Huánuco','Ambo','Colpas'),
('100204','1002','huanuco','Huánuco','Ambo','Conchamarca'),
('100205','1002','huanuco','Huánuco','Ambo','Huacar'),
('100206','1002','huanuco','Huánuco','Ambo','San Francisco'),
('100207','1002','huanuco','Huánuco','Ambo','San Rafael'),
('100208','1002','huanuco','Huánuco','Ambo','Tomay Kichwa'),
('100301','1003','huanuco','Huánuco','Dos de Mayo','La Union'),
('100307','1003','huanuco','Huánuco','Dos de Mayo','Chuquis'),
('100311','1003','huanuco','Huánuco','Dos de Mayo','Marias'),
('100313','1003','huanuco','Huánuco','Dos de Mayo','Pachas'),
('100316','1003','huanuco','Huánuco','Dos de Mayo','Quivilla'),
('100317','1003','huanuco','Huánuco','Dos de Mayo','Ripan'),
('100321','1003','huanuco','Huánuco','Dos de Mayo','Shunqui'),
('100322','1003','huanuco','Huánuco','Dos de Mayo','Sillapata'),
('100323','1003','huanuco','Huánuco','Dos de Mayo','Yanas'),
('100401','1004','huanuco','Huánuco','Huacaybamba','Huacaybamba'),
('100402','1004','huanuco','Huánuco','Huacaybamba','Canchabamba'),
('100403','1004','huanuco','Huánuco','Huacaybamba','Cochabamba'),
('100404','1004','huanuco','Huánuco','Huacaybamba','Pinra'),
('100501','1005','huanuco','Huánuco','Huamalies','Llata'),
('100502','1005','huanuco','Huánuco','Huamalies','Arancay'),
('100503','1005','huanuco','Huánuco','Huamalies','Chavin de Pariarca'),
('100504','1005','huanuco','Huánuco','Huamalies','Jacas Grande'),
('100505','1005','huanuco','Huánuco','Huamalies','Jircan'),
('100506','1005','huanuco','Huánuco','Huamalies','Miraflores'),
('100507','1005','huanuco','Huánuco','Huamalies','Monzon'),
('100508','1005','huanuco','Huánuco','Huamalies','Punchao'),
('100509','1005','huanuco','Huánuco','Huamalies','Puños'),
('100510','1005','huanuco','Huánuco','Huamalies','Singa'),
('100511','1005','huanuco','Huánuco','Huamalies','Tantamayo'),
('100601','1006','huanuco','Huánuco','Leoncio Prado','Rupa-rupa'),
('100602','1006','huanuco','Huánuco','Leoncio Prado','Daniel Alomia Robles'),
('100603','1006','huanuco','Huánuco','Leoncio Prado','Hermilio Valdizan'),
('100604','1006','huanuco','Huánuco','Leoncio Prado','Jose Crespo y Castillo'),
('100605','1006','huanuco','Huánuco','Leoncio Prado','Luyando'),
('100606','1006','huanuco','Huánuco','Leoncio Prado','Mariano Damaso Beraun'),
('100607','1006','huanuco','Huánuco','Leoncio Prado','Pucayacu'),
('100608','1006','huanuco','Huánuco','Leoncio Prado','Castillo Grande'),
('100609','1006','huanuco','Huánuco','Leoncio Prado','Pueblo Nuevo'),
('100610','1006','huanuco','Huánuco','Leoncio Prado','Santo Domingo de Anda'),
('100701','1007','huanuco','Huánuco','Marañon','Huacrachuco'),
('100702','1007','huanuco','Huánuco','Marañon','Cholon'),
('100703','1007','huanuco','Huánuco','Marañon','San Buenaventura'),
('100704','1007','huanuco','Huánuco','Marañon','La Morada'),
('100705','1007','huanuco','Huánuco','Marañon','Santa Rosa de Alto Yanajanca'),
('100801','1008','huanuco','Huánuco','Pachitea','Panao'),
('100802','1008','huanuco','Huánuco','Pachitea','Chaglla'),
('100803','1008','huanuco','Huánuco','Pachitea','Molino'),
('100804','1008','huanuco','Huánuco','Pachitea','Umari'),
('100901','1009','huanuco','Huánuco','Puerto Inca','Puerto Inca'),
('100902','1009','huanuco','Huánuco','Puerto Inca','Codo del Pozuzo'),
('100903','1009','huanuco','Huánuco','Puerto Inca','Honoria'),
('100904','1009','huanuco','Huánuco','Puerto Inca','Tournavista'),
('100905','1009','huanuco','Huánuco','Puerto Inca','Yuyapichis'),
('101001','1010','huanuco','Huánuco','Lauricocha','Jesus'),
('101002','1010','huanuco','Huánuco','Lauricocha','Baños'),
('101003','1010','huanuco','Huánuco','Lauricocha','Jivia'),
('101004','1010','huanuco','Huánuco','Lauricocha','Queropalca'),
('101005','1010','huanuco','Huánuco','Lauricocha','Rondos'),
('101006','1010','huanuco','Huánuco','Lauricocha','San Francisco de Asis'),
('101007','1010','huanuco','Huánuco','Lauricocha','San Miguel de Cauri'),
('101101','1011','huanuco','Huánuco','Yarowilca','Chavinillo'),
('101102','1011','huanuco','Huánuco','Yarowilca','Cahuac'),
('101103','1011','huanuco','Huánuco','Yarowilca','Chacabamba'),
('101104','1011','huanuco','Huánuco','Yarowilca','Aparicio Pomares'),
('101105','1011','huanuco','Huánuco','Yarowilca','Jacas Chico'),
('101106','1011','huanuco','Huánuco','Yarowilca','Obas'),
('101107','1011','huanuco','Huánuco','Yarowilca','Pampamarca'),
('101108','1011','huanuco','Huánuco','Yarowilca','Choras'),
('110101','1101','ica','Ica','Ica','Ica'),
('110102','1101','ica','Ica','Ica','La Tinguiña'),
('110103','1101','ica','Ica','Ica','Los Aquijes'),
('110104','1101','ica','Ica','Ica','Ocucaje'),
('110105','1101','ica','Ica','Ica','Pachacutec'),
('110106','1101','ica','Ica','Ica','Parcona'),
('110107','1101','ica','Ica','Ica','Pueblo Nuevo'),
('110108','1101','ica','Ica','Ica','Salas'),
('110109','1101','ica','Ica','Ica','San Jose de los Molinos'),
('110110','1101','ica','Ica','Ica','San Juan Bautista'),
('110111','1101','ica','Ica','Ica','Santiago'),
('110112','1101','ica','Ica','Ica','Subtanjalla'),
('110113','1101','ica','Ica','Ica','Tate'),
('110114','1101','ica','Ica','Ica','Yauca del Rosario'),
('110201','1102','ica','Ica','Chincha','Chincha Alta'),
('110202','1102','ica','Ica','Chincha','Alto Laran'),
('110203','1102','ica','Ica','Chincha','Chavin'),
('110204','1102','ica','Ica','Chincha','Chincha Baja'),
('110205','1102','ica','Ica','Chincha','El Carmen'),
('110206','1102','ica','Ica','Chincha','Grocio Prado'),
('110207','1102','ica','Ica','Chincha','Pueblo Nuevo'),
('110208','1102','ica','Ica','Chincha','San Juan de Yanac'),
('110209','1102','ica','Ica','Chincha','San Pedro de Huacarpana'),
('110210','1102','ica','Ica','Chincha','Sunampe'),
('110211','1102','ica','Ica','Chincha','Tambo de Mora'),
('110301','1103','ica','Ica','Nasca','Nasca'),
('110302','1103','ica','Ica','Nasca','Changuillo'),
('110303','1103','ica','Ica','Nasca','El Ingenio'),
('110304','1103','ica','Ica','Nasca','Marcona'),
('110305','1103','ica','Ica','Nasca','Vista Alegre'),
('110401','1104','ica','Ica','Palpa','Palpa'),
('110402','1104','ica','Ica','Palpa','Llipata'),
('110403','1104','ica','Ica','Palpa','Rio Grande'),
('110404','1104','ica','Ica','Palpa','Santa Cruz'),
('110405','1104','ica','Ica','Palpa','Tibillo'),
('110501','1105','ica','Ica','Pisco','Pisco'),
('110502','1105','ica','Ica','Pisco','Huancano'),
('110503','1105','ica','Ica','Pisco','Humay'),
('110504','1105','ica','Ica','Pisco','Independencia'),
('110505','1105','ica','Ica','Pisco','Paracas'),
('110506','1105','ica','Ica','Pisco','San Andres'),
('110507','1105','ica','Ica','Pisco','San Clemente'),
('110508','1105','ica','Ica','Pisco','Tupac Amaru Inca'),
('120101','1201','junin','Junín','Huancayo','Huancayo'),
('120104','1201','junin','Junín','Huancayo','Carhuacallanga'),
('120105','1201','junin','Junín','Huancayo','Chacapampa'),
('120106','1201','junin','Junín','Huancayo','Chicche'),
('120107','1201','junin','Junín','Huancayo','Chilca'),
('120108','1201','junin','Junín','Huancayo','Chongos Alto'),
('120111','1201','junin','Junín','Huancayo','Chupuro'),
('120112','1201','junin','Junín','Huancayo','Colca'),
('120113','1201','junin','Junín','Huancayo','Cullhuas'),
('120114','1201','junin','Junín','Huancayo','El Tambo'),
('120116','1201','junin','Junín','Huancayo','Huacrapuquio'),
('120117','1201','junin','Junín','Huancayo','Hualhuas'),
('120119','1201','junin','Junín','Huancayo','Huancan'),
('120120','1201','junin','Junín','Huancayo','Huasicancha'),
('120121','1201','junin','Junín','Huancayo','Huayucachi'),
('120122','1201','junin','Junín','Huancayo','Ingenio'),
('120124','1201','junin','Junín','Huancayo','Pariahuanca'),
('120125','1201','junin','Junín','Huancayo','Pilcomayo'),
('120126','1201','junin','Junín','Huancayo','Pucara'),
('120127','1201','junin','Junín','Huancayo','Quichuay'),
('120128','1201','junin','Junín','Huancayo','Quilcas'),
('120129','1201','junin','Junín','Huancayo','San Agustin'),
('120130','1201','junin','Junín','Huancayo','San Jeronimo de Tunan'),
('120132','1201','junin','Junín','Huancayo','Saño'),
('120133','1201','junin','Junín','Huancayo','Sapallanga'),
('120134','1201','junin','Junín','Huancayo','Sicaya'),
('120135','1201','junin','Junín','Huancayo','Santo Domingo de Acobamba'),
('120136','1201','junin','Junín','Huancayo','Viques'),
('120201','1202','junin','Junín','Concepcion','Concepcion'),
('120202','1202','junin','Junín','Concepcion','Aco'),
('120203','1202','junin','Junín','Concepcion','Andamarca'),
('120204','1202','junin','Junín','Concepcion','Chambara'),
('120205','1202','junin','Junín','Concepcion','Cochas'),
('120206','1202','junin','Junín','Concepcion','Comas'),
('120207','1202','junin','Junín','Concepcion','Heroinas Toledo'),
('120208','1202','junin','Junín','Concepcion','Manzanares'),
('120209','1202','junin','Junín','Concepcion','Mariscal Castilla'),
('120210','1202','junin','Junín','Concepcion','Matahuasi'),
('120211','1202','junin','Junín','Concepcion','Mito'),
('120212','1202','junin','Junín','Concepcion','Nueve de Julio'),
('120213','1202','junin','Junín','Concepcion','Orcotuna'),
('120214','1202','junin','Junín','Concepcion','San Jose de Quero'),
('120215','1202','junin','Junín','Concepcion','Santa Rosa de Ocopa'),
('120301','1203','junin','Junín','Chanchamayo','Chanchamayo'),
('120302','1203','junin','Junín','Chanchamayo','Perene'),
('120303','1203','junin','Junín','Chanchamayo','Pichanaqui'),
('120304','1203','junin','Junín','Chanchamayo','San Luis de Shuaro'),
('120305','1203','junin','Junín','Chanchamayo','San Ramon'),
('120306','1203','junin','Junín','Chanchamayo','Vitoc'),
('120401','1204','junin','Junín','Jauja','Jauja'),
('120402','1204','junin','Junín','Jauja','Acolla'),
('120403','1204','junin','Junín','Jauja','Apata'),
('120404','1204','junin','Junín','Jauja','Ataura'),
('120405','1204','junin','Junín','Jauja','Canchayllo'),
('120406','1204','junin','Junín','Jauja','Curicaca'),
('120407','1204','junin','Junín','Jauja','El Mantaro'),
('120408','1204','junin','Junín','Jauja','Huamali'),
('120409','1204','junin','Junín','Jauja','Huaripampa'),
('120410','1204','junin','Junín','Jauja','Huertas'),
('120411','1204','junin','Junín','Jauja','Janjaillo'),
('120412','1204','junin','Junín','Jauja','Julcan'),
('120413','1204','junin','Junín','Jauja','Leonor Ordoñez'),
('120414','1204','junin','Junín','Jauja','Llocllapampa'),
('120415','1204','junin','Junín','Jauja','Marco'),
('120416','1204','junin','Junín','Jauja','Masma'),
('120417','1204','junin','Junín','Jauja','Masma Chicche'),
('120418','1204','junin','Junín','Jauja','Molinos'),
('120419','1204','junin','Junín','Jauja','Monobamba'),
('120420','1204','junin','Junín','Jauja','Muqui'),
('120421','1204','junin','Junín','Jauja','Muquiyauyo'),
('120422','1204','junin','Junín','Jauja','Paca'),
('120423','1204','junin','Junín','Jauja','Paccha'),
('120424','1204','junin','Junín','Jauja','Pancan'),
('120425','1204','junin','Junín','Jauja','Parco'),
('120426','1204','junin','Junín','Jauja','Pomacancha'),
('120427','1204','junin','Junín','Jauja','Ricran'),
('120428','1204','junin','Junín','Jauja','San Lorenzo'),
('120429','1204','junin','Junín','Jauja','San Pedro de Chunan'),
('120430','1204','junin','Junín','Jauja','Sausa'),
('120431','1204','junin','Junín','Jauja','Sincos'),
('120432','1204','junin','Junín','Jauja','Tunan Marca'),
('120433','1204','junin','Junín','Jauja','Yauli'),
('120434','1204','junin','Junín','Jauja','Yauyos'),
('120501','1205','junin','Junín','Junín','Junín'),
('120502','1205','junin','Junín','Junín','Carhuamayo'),
('120503','1205','junin','Junín','Junín','Ondores'),
('120504','1205','junin','Junín','Junín','Ulcumayo'),
('120601','1206','junin','Junín','Satipo','Satipo'),
('120602','1206','junin','Junín','Satipo','Coviriali'),
('120603','1206','junin','Junín','Satipo','Llaylla'),
('120604','1206','junin','Junín','Satipo','Mazamari'),
('120605','1206','junin','Junín','Satipo','Pampa Hermosa'),
('120606','1206','junin','Junín','Satipo','Pangoa'),
('120607','1206','junin','Junín','Satipo','Rio Negro'),
('120608','1206','junin','Junín','Satipo','Rio Tambo'),
('120609','1206','junin','Junín','Satipo','Vizcatán del Ene'),
('120701','1207','junin','Junín','Tarma','Tarma'),
('120702','1207','junin','Junín','Tarma','Acobamba'),
('120703','1207','junin','Junín','Tarma','Huaricolca'),
('120704','1207','junin','Junín','Tarma','Huasahuasi'),
('120705','1207','junin','Junín','Tarma','La Union'),
('120706','1207','junin','Junín','Tarma','Palca'),
('120707','1207','junin','Junín','Tarma','Palcamayo'),
('120708','1207','junin','Junín','Tarma','San Pedro de Cajas'),
('120709','1207','junin','Junín','Tarma','Tapo'),
('120801','1208','junin','Junín','Yauli','La Oroya'),
('120802','1208','junin','Junín','Yauli','Chacapalpa'),
('120803','1208','junin','Junín','Yauli','Huay-huay'),
('120804','1208','junin','Junín','Yauli','Marcapomacocha'),
('120805','1208','junin','Junín','Yauli','Morococha'),
('120806','1208','junin','Junín','Yauli','Paccha'),
('120807','1208','junin','Junín','Yauli','Santa Barbara de Carhuacayan'),
('120808','1208','junin','Junín','Yauli','Santa Rosa de Sacco'),
('120809','1208','junin','Junín','Yauli','Suitucancha'),
('120810','1208','junin','Junín','Yauli','Yauli'),
('120901','1209','junin','Junín','Chupaca','Chupaca'),
('120902','1209','junin','Junín','Chupaca','Ahuac'),
('120903','1209','junin','Junín','Chupaca','Chongos Bajo'),
('120904','1209','junin','Junín','Chupaca','Huachac'),
('120905','1209','junin','Junín','Chupaca','Huamancaca Chico'),
('120906','1209','junin','Junín','Chupaca','San Juan de Iscos'),
('120907','1209','junin','Junín','Chupaca','San Juan de Jarpa'),
('120908','1209','junin','Junín','Chupaca','Tres de Diciembre'),
('120909','1209','junin','Junín','Chupaca','Yanacancha'),
('130101','1301','la-libertad','La Libertad','Trujillo','Trujillo'),
('130102','1301','la-libertad','La Libertad','Trujillo','El Porvenir'),
('130103','1301','la-libertad','La Libertad','Trujillo','Florencia de Mora'),
('130104','1301','la-libertad','La Libertad','Trujillo','Huanchaco'),
('130105','1301','la-libertad','La Libertad','Trujillo','La Esperanza'),
('130106','1301','la-libertad','La Libertad','Trujillo','Laredo'),
('130107','1301','la-libertad','La Libertad','Trujillo','Moche'),
('130108','1301','la-libertad','La Libertad','Trujillo','Poroto'),
('130109','1301','la-libertad','La Libertad','Trujillo','Salaverry'),
('130110','1301','la-libertad','La Libertad','Trujillo','Simbal'),
('130111','1301','la-libertad','La Libertad','Trujillo','Victor Larco Herrera'),
('130112','1301','la-libertad','La Libertad','Trujillo','Alto Trujillo'),
('130201','1302','la-libertad','La Libertad','Ascope','Ascope'),
('130202','1302','la-libertad','La Libertad','Ascope','Chicama'),
('130203','1302','la-libertad','La Libertad','Ascope','Chocope'),
('130204','1302','la-libertad','La Libertad','Ascope','Magdalena de Cao'),
('130205','1302','la-libertad','La Libertad','Ascope','Paijan'),
('130206','1302','la-libertad','La Libertad','Ascope','Razuri'),
('130207','1302','la-libertad','La Libertad','Ascope','Santiago de Cao'),
('130208','1302','la-libertad','La Libertad','Ascope','Casa Grande'),
('130301','1303','la-libertad','La Libertad','Bolivar','Bolivar'),
('130302','1303','la-libertad','La Libertad','Bolivar','Bambamarca'),
('130303','1303','la-libertad','La Libertad','Bolivar','Condormarca'),
('130304','1303','la-libertad','La Libertad','Bolivar','Longotea'),
('130305','1303','la-libertad','La Libertad','Bolivar','Uchumarca'),
('130306','1303','la-libertad','La Libertad','Bolivar','Ucuncha'),
('130401','1304','la-libertad','La Libertad','Chepen','Chepen'),
('130402','1304','la-libertad','La Libertad','Chepen','Pacanga'),
('130403','1304','la-libertad','La Libertad','Chepen','Pueblo Nuevo'),
('130501','1305','la-libertad','La Libertad','Julcan','Julcan'),
('130502','1305','la-libertad','La Libertad','Julcan','Calamarca'),
('130503','1305','la-libertad','La Libertad','Julcan','Carabamba'),
('130504','1305','la-libertad','La Libertad','Julcan','Huaso'),
('130601','1306','la-libertad','La Libertad','Otuzco','Otuzco'),
('130602','1306','la-libertad','La Libertad','Otuzco','Agallpampa'),
('130604','1306','la-libertad','La Libertad','Otuzco','Charat'),
('130605','1306','la-libertad','La Libertad','Otuzco','Huaranchal'),
('130606','1306','la-libertad','La Libertad','Otuzco','La Cuesta'),
('130608','1306','la-libertad','La Libertad','Otuzco','Mache'),
('130610','1306','la-libertad','La Libertad','Otuzco','Paranday'),
('130611','1306','la-libertad','La Libertad','Otuzco','Salpo'),
('130613','1306','la-libertad','La Libertad','Otuzco','Sinsicap'),
('130614','1306','la-libertad','La Libertad','Otuzco','Usquil'),
('130701','1307','la-libertad','La Libertad','Pacasmayo','San Pedro de Lloc'),
('130702','1307','la-libertad','La Libertad','Pacasmayo','Guadalupe'),
('130703','1307','la-libertad','La Libertad','Pacasmayo','Jequetepeque'),
('130704','1307','la-libertad','La Libertad','Pacasmayo','Pacasmayo'),
('130705','1307','la-libertad','La Libertad','Pacasmayo','San Jose'),
('130801','1308','la-libertad','La Libertad','Pataz','Tayabamba'),
('130802','1308','la-libertad','La Libertad','Pataz','Buldibuyo'),
('130803','1308','la-libertad','La Libertad','Pataz','Chillia'),
('130804','1308','la-libertad','La Libertad','Pataz','Huancaspata'),
('130805','1308','la-libertad','La Libertad','Pataz','Huaylillas'),
('130806','1308','la-libertad','La Libertad','Pataz','Huayo'),
('130807','1308','la-libertad','La Libertad','Pataz','Ongon'),
('130808','1308','la-libertad','La Libertad','Pataz','Parcoy'),
('130809','1308','la-libertad','La Libertad','Pataz','Pataz'),
('130810','1308','la-libertad','La Libertad','Pataz','Pias'),
('130811','1308','la-libertad','La Libertad','Pataz','Santiago de Challas'),
('130812','1308','la-libertad','La Libertad','Pataz','Taurija'),
('130813','1308','la-libertad','La Libertad','Pataz','Urpay'),
('130901','1309','la-libertad','La Libertad','Sanchez Carrion','Huamachuco'),
('130902','1309','la-libertad','La Libertad','Sanchez Carrion','Chugay'),
('130903','1309','la-libertad','La Libertad','Sanchez Carrion','Cochorco'),
('130904','1309','la-libertad','La Libertad','Sanchez Carrion','Curgos'),
('130905','1309','la-libertad','La Libertad','Sanchez Carrion','Marcabal'),
('130906','1309','la-libertad','La Libertad','Sanchez Carrion','Sanagoran'),
('130907','1309','la-libertad','La Libertad','Sanchez Carrion','Sarin'),
('130908','1309','la-libertad','La Libertad','Sanchez Carrion','Sartimbamba'),
('131001','1310','la-libertad','La Libertad','Santiago de Chuco','Santiago de Chuco'),
('131002','1310','la-libertad','La Libertad','Santiago de Chuco','Angasmarca'),
('131003','1310','la-libertad','La Libertad','Santiago de Chuco','Cachicadan'),
('131004','1310','la-libertad','La Libertad','Santiago de Chuco','Mollebamba'),
('131005','1310','la-libertad','La Libertad','Santiago de Chuco','Mollepata'),
('131006','1310','la-libertad','La Libertad','Santiago de Chuco','Quiruvilca'),
('131007','1310','la-libertad','La Libertad','Santiago de Chuco','Santa Cruz de Chuca'),
('131008','1310','la-libertad','La Libertad','Santiago de Chuco','Sitabamba'),
('131101','1311','la-libertad','La Libertad','Gran Chimu','Cascas'),
('131102','1311','la-libertad','La Libertad','Gran Chimu','Lucma'),
('131103','1311','la-libertad','La Libertad','Gran Chimu','Marmot'),
('131104','1311','la-libertad','La Libertad','Gran Chimu','Sayapullo'),
('131201','1312','la-libertad','La Libertad','Viru','Viru'),
('131202','1312','la-libertad','La Libertad','Viru','Chao'),
('131203','1312','la-libertad','La Libertad','Viru','Guadalupito'),
('140101','1401','lambayeque','Lambayeque','Chiclayo','Chiclayo'),
('140102','1401','lambayeque','Lambayeque','Chiclayo','Chongoyape'),
('140103','1401','lambayeque','Lambayeque','Chiclayo','Eten'),
('140104','1401','lambayeque','Lambayeque','Chiclayo','Eten Puerto'),
('140105','1401','lambayeque','Lambayeque','Chiclayo','Jose Leonardo Ortiz'),
('140106','1401','lambayeque','Lambayeque','Chiclayo','La Victoria'),
('140107','1401','lambayeque','Lambayeque','Chiclayo','Lagunas'),
('140108','1401','lambayeque','Lambayeque','Chiclayo','Monsefu'),
('140109','1401','lambayeque','Lambayeque','Chiclayo','Nueva Arica'),
('140110','1401','lambayeque','Lambayeque','Chiclayo','Oyotun'),
('140111','1401','lambayeque','Lambayeque','Chiclayo','Picsi'),
('140112','1401','lambayeque','Lambayeque','Chiclayo','Pimentel'),
('140113','1401','lambayeque','Lambayeque','Chiclayo','Reque'),
('140114','1401','lambayeque','Lambayeque','Chiclayo','Santa Rosa'),
('140115','1401','lambayeque','Lambayeque','Chiclayo','Saña'),
('140116','1401','lambayeque','Lambayeque','Chiclayo','Cayalti'),
('140117','1401','lambayeque','Lambayeque','Chiclayo','Patapo'),
('140118','1401','lambayeque','Lambayeque','Chiclayo','Pomalca'),
('140119','1401','lambayeque','Lambayeque','Chiclayo','Pucala'),
('140120','1401','lambayeque','Lambayeque','Chiclayo','Tuman'),
('140201','1402','lambayeque','Lambayeque','Ferreñafe','Ferreñafe'),
('140202','1402','lambayeque','Lambayeque','Ferreñafe','Cañaris'),
('140203','1402','lambayeque','Lambayeque','Ferreñafe','Incahuasi'),
('140204','1402','lambayeque','Lambayeque','Ferreñafe','Manuel Antonio Mesones Muro'),
('140205','1402','lambayeque','Lambayeque','Ferreñafe','Pitipo'),
('140206','1402','lambayeque','Lambayeque','Ferreñafe','Pueblo Nuevo'),
('140301','1403','lambayeque','Lambayeque','Lambayeque','Lambayeque'),
('140302','1403','lambayeque','Lambayeque','Lambayeque','Chochope'),
('140303','1403','lambayeque','Lambayeque','Lambayeque','Illimo'),
('140304','1403','lambayeque','Lambayeque','Lambayeque','Jayanca'),
('140305','1403','lambayeque','Lambayeque','Lambayeque','Mochumi'),
('140306','1403','lambayeque','Lambayeque','Lambayeque','Morrope'),
('140307','1403','lambayeque','Lambayeque','Lambayeque','Motupe'),
('140308','1403','lambayeque','Lambayeque','Lambayeque','Olmos'),
('140309','1403','lambayeque','Lambayeque','Lambayeque','Pacora'),
('140310','1403','lambayeque','Lambayeque','Lambayeque','Salas'),
('140311','1403','lambayeque','Lambayeque','Lambayeque','San Jose'),
('140312','1403','lambayeque','Lambayeque','Lambayeque','Tucume'),
('150101','1501','lima','Lima','Lima','Lima'),
('150102','1501','lima','Lima','Lima','Ancon'),
('150103','1501','lima','Lima','Lima','Ate'),
('150104','1501','lima','Lima','Lima','Barranco'),
('150105','1501','lima','Lima','Lima','Breña'),
('150106','1501','lima','Lima','Lima','Carabayllo'),
('150107','1501','lima','Lima','Lima','Chaclacayo'),
('150108','1501','lima','Lima','Lima','Chorrillos'),
('150109','1501','lima','Lima','Lima','Cieneguilla'),
('150110','1501','lima','Lima','Lima','Comas'),
('150111','1501','lima','Lima','Lima','El Agustino'),
('150112','1501','lima','Lima','Lima','Independencia'),
('150113','1501','lima','Lima','Lima','Jesus Maria'),
('150114','1501','lima','Lima','Lima','La Molina'),
('150115','1501','lima','Lima','Lima','La Victoria'),
('150116','1501','lima','Lima','Lima','Lince'),
('150117','1501','lima','Lima','Lima','Los Olivos'),
('150118','1501','lima','Lima','Lima','Lurigancho'),
('150119','1501','lima','Lima','Lima','Lurin'),
('150120','1501','lima','Lima','Lima','Magdalena del Mar'),
('150121','1501','lima','Lima','Lima','Pueblo Libre'),
('150122','1501','lima','Lima','Lima','Miraflores'),
('150123','1501','lima','Lima','Lima','Pachacamac'),
('150124','1501','lima','Lima','Lima','Pucusana'),
('150125','1501','lima','Lima','Lima','Puente Piedra'),
('150126','1501','lima','Lima','Lima','Punta Hermosa'),
('150127','1501','lima','Lima','Lima','Punta Negra'),
('150128','1501','lima','Lima','Lima','Rimac'),
('150129','1501','lima','Lima','Lima','San Bartolo'),
('150130','1501','lima','Lima','Lima','San Borja'),
('150131','1501','lima','Lima','Lima','San Isidro'),
('150132','1501','lima','Lima','Lima','San Juan de Lurigancho'),
('150133','1501','lima','Lima','Lima','San Juan de Miraflores'),
('150134','1501','lima','Lima','Lima','San Luis'),
('150135','1501','lima','Lima','Lima','San Martin de Porres'),
('150136','1501','lima','Lima','Lima','San Miguel'),
('150137','1501','lima','Lima','Lima','Santa Anita'),
('150138','1501','lima','Lima','Lima','Santa Maria del Mar'),
('150139','1501','lima','Lima','Lima','Santa Rosa'),
('150140','1501','lima','Lima','Lima','Santiago de Surco'),
('150141','1501','lima','Lima','Lima','Surquillo'),
('150142','1501','lima','Lima','Lima','Villa el Salvador'),
('150143','1501','lima','Lima','Lima','Villa Maria del Triunfo'),
('150201','1502','lima','Lima','Barranca','Barranca'),
('150202','1502','lima','Lima','Barranca','Paramonga'),
('150203','1502','lima','Lima','Barranca','Pativilca'),
('150204','1502','lima','Lima','Barranca','Supe'),
('150205','1502','lima','Lima','Barranca','Supe Puerto'),
('150301','1503','lima','Lima','Cajatambo','Cajatambo'),
('150302','1503','lima','Lima','Cajatambo','Copa'),
('150303','1503','lima','Lima','Cajatambo','Gorgor'),
('150304','1503','lima','Lima','Cajatambo','Huancapon'),
('150305','1503','lima','Lima','Cajatambo','Manas'),
('150401','1504','lima','Lima','Canta','Canta'),
('150402','1504','lima','Lima','Canta','Arahuay'),
('150403','1504','lima','Lima','Canta','Huamantanga'),
('150404','1504','lima','Lima','Canta','Huaros'),
('150405','1504','lima','Lima','Canta','Lachaqui'),
('150406','1504','lima','Lima','Canta','San Buenaventura'),
('150407','1504','lima','Lima','Canta','Santa Rosa de Quives'),
('150501','1505','lima','Lima','Cañete','San Vicente de Cañete'),
('150502','1505','lima','Lima','Cañete','Asia'),
('150503','1505','lima','Lima','Cañete','Calango'),
('150504','1505','lima','Lima','Cañete','Cerro Azul'),
('150505','1505','lima','Lima','Cañete','Chilca'),
('150506','1505','lima','Lima','Cañete','Coayllo'),
('150507','1505','lima','Lima','Cañete','Imperial'),
('150508','1505','lima','Lima','Cañete','Lunahuana'),
('150509','1505','lima','Lima','Cañete','Mala'),
('150510','1505','lima','Lima','Cañete','Nuevo Imperial'),
('150511','1505','lima','Lima','Cañete','Pacaran'),
('150512','1505','lima','Lima','Cañete','Quilmana'),
('150513','1505','lima','Lima','Cañete','San Antonio'),
('150514','1505','lima','Lima','Cañete','San Luis'),
('150515','1505','lima','Lima','Cañete','Santa Cruz de Flores'),
('150516','1505','lima','Lima','Cañete','Zuñiga'),
('150601','1506','lima','Lima','Huaral','Huaral'),
('150602','1506','lima','Lima','Huaral','Atavillos Alto'),
('150603','1506','lima','Lima','Huaral','Atavillos Bajo'),
('150604','1506','lima','Lima','Huaral','Aucallama'),
('150605','1506','lima','Lima','Huaral','Chancay'),
('150606','1506','lima','Lima','Huaral','Ihuari'),
('150607','1506','lima','Lima','Huaral','Lampian'),
('150608','1506','lima','Lima','Huaral','Pacaraos'),
('150609','1506','lima','Lima','Huaral','San Miguel de Acos'),
('150610','1506','lima','Lima','Huaral','Santa Cruz de Andamarca'),
('150611','1506','lima','Lima','Huaral','Sumbilca'),
('150612','1506','lima','Lima','Huaral','Veintisiete de Noviembre'),
('150701','1507','lima','Lima','Huarochiri','Matucana'),
('150702','1507','lima','Lima','Huarochiri','Antioquia'),
('150703','1507','lima','Lima','Huarochiri','Callahuanca'),
('150704','1507','lima','Lima','Huarochiri','Carampoma'),
('150705','1507','lima','Lima','Huarochiri','Chicla'),
('150706','1507','lima','Lima','Huarochiri','Cuenca'),
('150707','1507','lima','Lima','Huarochiri','Huachupampa'),
('150708','1507','lima','Lima','Huarochiri','Huanza'),
('150709','1507','lima','Lima','Huarochiri','Huarochiri'),
('150710','1507','lima','Lima','Huarochiri','Lahuaytambo'),
('150711','1507','lima','Lima','Huarochiri','Langa'),
('150712','1507','lima','Lima','Huarochiri','San Pedro de Laraos'),
('150713','1507','lima','Lima','Huarochiri','Mariatana'),
('150714','1507','lima','Lima','Huarochiri','Ricardo Palma'),
('150715','1507','lima','Lima','Huarochiri','San Andres de Tupicocha'),
('150716','1507','lima','Lima','Huarochiri','San Antonio'),
('150717','1507','lima','Lima','Huarochiri','San Bartolome'),
('150718','1507','lima','Lima','Huarochiri','San Damian'),
('150719','1507','lima','Lima','Huarochiri','San Juan de Iris'),
('150720','1507','lima','Lima','Huarochiri','San Juan de Tantaranche'),
('150721','1507','lima','Lima','Huarochiri','San Lorenzo de Quinti'),
('150722','1507','lima','Lima','Huarochiri','San Mateo'),
('150723','1507','lima','Lima','Huarochiri','San Mateo de Otao'),
('150724','1507','lima','Lima','Huarochiri','San Pedro de Casta'),
('150725','1507','lima','Lima','Huarochiri','San Pedro de Huancayre'),
('150726','1507','lima','Lima','Huarochiri','Sangallaya'),
('150727','1507','lima','Lima','Huarochiri','Santa Cruz de Cocachacra'),
('150728','1507','lima','Lima','Huarochiri','Santa Eulalia'),
('150729','1507','lima','Lima','Huarochiri','Santiago de Anchucaya'),
('150730','1507','lima','Lima','Huarochiri','Santiago de Tuna'),
('150731','1507','lima','Lima','Huarochiri','Santo Domingo de los Olleros'),
('150732','1507','lima','Lima','Huarochiri','Surco'),
('150801','1508','lima','Lima','Huaura','Huacho'),
('150802','1508','lima','Lima','Huaura','Ambar'),
('150803','1508','lima','Lima','Huaura','Caleta de Carquin'),
('150804','1508','lima','Lima','Huaura','Checras'),
('150805','1508','lima','Lima','Huaura','Hualmay'),
('150806','1508','lima','Lima','Huaura','Huaura'),
('150807','1508','lima','Lima','Huaura','Leoncio Prado'),
('150808','1508','lima','Lima','Huaura','Paccho'),
('150809','1508','lima','Lima','Huaura','Santa Leonor'),
('150810','1508','lima','Lima','Huaura','Santa Maria'),
('150811','1508','lima','Lima','Huaura','Sayan'),
('150812','1508','lima','Lima','Huaura','Vegueta'),
('150901','1509','lima','Lima','Oyon','Oyon'),
('150902','1509','lima','Lima','Oyon','Andajes'),
('150903','1509','lima','Lima','Oyon','Caujul'),
('150904','1509','lima','Lima','Oyon','Cochamarca'),
('150905','1509','lima','Lima','Oyon','Navan'),
('150906','1509','lima','Lima','Oyon','Pachangara'),
('151001','1510','lima','Lima','Yauyos','Yauyos'),
('151002','1510','lima','Lima','Yauyos','Alis'),
('151003','1510','lima','Lima','Yauyos','Allauca'),
('151004','1510','lima','Lima','Yauyos','Ayaviri'),
('151005','1510','lima','Lima','Yauyos','Azangaro'),
('151006','1510','lima','Lima','Yauyos','Cacra'),
('151007','1510','lima','Lima','Yauyos','Carania'),
('151008','1510','lima','Lima','Yauyos','Catahuasi'),
('151009','1510','lima','Lima','Yauyos','Chocos'),
('151010','1510','lima','Lima','Yauyos','Cochas'),
('151011','1510','lima','Lima','Yauyos','Colonia'),
('151012','1510','lima','Lima','Yauyos','Hongos'),
('151013','1510','lima','Lima','Yauyos','Huampara'),
('151014','1510','lima','Lima','Yauyos','Huancaya'),
('151015','1510','lima','Lima','Yauyos','Huangascar'),
('151016','1510','lima','Lima','Yauyos','Huantan'),
('151017','1510','lima','Lima','Yauyos','Huañec'),
('151018','1510','lima','Lima','Yauyos','Laraos'),
('151019','1510','lima','Lima','Yauyos','Lincha'),
('151020','1510','lima','Lima','Yauyos','Madean'),
('151021','1510','lima','Lima','Yauyos','Miraflores'),
('151022','1510','lima','Lima','Yauyos','Omas'),
('151023','1510','lima','Lima','Yauyos','Putinza'),
('151024','1510','lima','Lima','Yauyos','Quinches'),
('151025','1510','lima','Lima','Yauyos','Quinocay'),
('151026','1510','lima','Lima','Yauyos','San Joaquin'),
('151027','1510','lima','Lima','Yauyos','San Pedro de Pilas'),
('151028','1510','lima','Lima','Yauyos','Tanta'),
('151029','1510','lima','Lima','Yauyos','Tauripampa'),
('151030','1510','lima','Lima','Yauyos','Tomas'),
('151031','1510','lima','Lima','Yauyos','Tupe'),
('151032','1510','lima','Lima','Yauyos','Viñac'),
('151033','1510','lima','Lima','Yauyos','Vitis'),
('160101','1601','loreto','Loreto','Maynas','Iquitos'),
('160102','1601','loreto','Loreto','Maynas','Alto Nanay'),
('160103','1601','loreto','Loreto','Maynas','Fernando Lores'),
('160104','1601','loreto','Loreto','Maynas','Indiana'),
('160105','1601','loreto','Loreto','Maynas','Las Amazonas'),
('160106','1601','loreto','Loreto','Maynas','Mazan'),
('160107','1601','loreto','Loreto','Maynas','Napo'),
('160108','1601','loreto','Loreto','Maynas','Punchana'),
('160110','1601','loreto','Loreto','Maynas','Torres Causana'),
('160112','1601','loreto','Loreto','Maynas','Belen'),
('160113','1601','loreto','Loreto','Maynas','San Juan Bautista'),
('160201','1602','loreto','Loreto','Alto Amazonas','Yurimaguas'),
('160202','1602','loreto','Loreto','Alto Amazonas','Balsapuerto'),
('160205','1602','loreto','Loreto','Alto Amazonas','Jeberos'),
('160206','1602','loreto','Loreto','Alto Amazonas','Lagunas'),
('160210','1602','loreto','Loreto','Alto Amazonas','Santa Cruz'),
('160211','1602','loreto','Loreto','Alto Amazonas','Teniente Cesar Lopez Rojas'),
('160301','1603','loreto','Loreto','Loreto','Nauta'),
('160302','1603','loreto','Loreto','Loreto','Parinari'),
('160303','1603','loreto','Loreto','Loreto','Tigre'),
('160304','1603','loreto','Loreto','Loreto','Trompeteros'),
('160305','1603','loreto','Loreto','Loreto','Urarinas'),
('160401','1604','loreto','Loreto','Mariscal Ramon Castilla','Ramon Castilla'),
('160402','1604','loreto','Loreto','Mariscal Ramon Castilla','Pebas'),
('160403','1604','loreto','Loreto','Mariscal Ramon Castilla','Yavari'),
('160404','1604','loreto','Loreto','Mariscal Ramon Castilla','San Pablo'),
('160501','1605','loreto','Loreto','Requena','Requena'),
('160502','1605','loreto','Loreto','Requena','Alto Tapiche'),
('160503','1605','loreto','Loreto','Requena','Capelo'),
('160504','1605','loreto','Loreto','Requena','Emilio San Martin'),
('160505','1605','loreto','Loreto','Requena','Maquia'),
('160506','1605','loreto','Loreto','Requena','Puinahua'),
('160507','1605','loreto','Loreto','Requena','Saquena'),
('160508','1605','loreto','Loreto','Requena','Soplin'),
('160509','1605','loreto','Loreto','Requena','Tapiche'),
('160510','1605','loreto','Loreto','Requena','Jenaro Herrera'),
('160511','1605','loreto','Loreto','Requena','Yaquerana'),
('160601','1606','loreto','Loreto','Ucayali','Contamana'),
('160602','1606','loreto','Loreto','Ucayali','Inahuaya'),
('160603','1606','loreto','Loreto','Ucayali','Padre Marquez'),
('160604','1606','loreto','Loreto','Ucayali','Pampa Hermosa'),
('160605','1606','loreto','Loreto','Ucayali','Sarayacu'),
('160606','1606','loreto','Loreto','Ucayali','Vargas Guerra'),
('160701','1607','loreto','Loreto','Datem del Marañon','Barranca'),
('160702','1607','loreto','Loreto','Datem del Marañon','Cahuapanas'),
('160703','1607','loreto','Loreto','Datem del Marañon','Manseriche'),
('160704','1607','loreto','Loreto','Datem del Marañon','Morona'),
('160705','1607','loreto','Loreto','Datem del Marañon','Pastaza'),
('160706','1607','loreto','Loreto','Datem del Marañon','Andoas'),
('160801','1608','loreto','Loreto','Putumayo','Putumayo'),
('160802','1608','loreto','Loreto','Putumayo','Rosa Panduro'),
('160803','1608','loreto','Loreto','Putumayo','Teniente Manuel Clavero'),
('160804','1608','loreto','Loreto','Putumayo','Yaguas'),
('170101','1701','madre-de-dios','Madre de Dios','Tambopata','Tambopata'),
('170102','1701','madre-de-dios','Madre de Dios','Tambopata','Inambari'),
('170103','1701','madre-de-dios','Madre de Dios','Tambopata','Las Piedras'),
('170104','1701','madre-de-dios','Madre de Dios','Tambopata','Laberinto'),
('170201','1702','madre-de-dios','Madre de Dios','Manu','Manu'),
('170202','1702','madre-de-dios','Madre de Dios','Manu','Fitzcarrald'),
('170203','1702','madre-de-dios','Madre de Dios','Manu','Madre de Dios'),
('170204','1702','madre-de-dios','Madre de Dios','Manu','Huepetuhe'),
('170301','1703','madre-de-dios','Madre de Dios','Tahuamanu','Iñapari'),
('170302','1703','madre-de-dios','Madre de Dios','Tahuamanu','Iberia'),
('170303','1703','madre-de-dios','Madre de Dios','Tahuamanu','Tahuamanu'),
('180101','1801','moquegua','Moquegua','Mariscal Nieto','Moquegua'),
('180102','1801','moquegua','Moquegua','Mariscal Nieto','Carumas'),
('180103','1801','moquegua','Moquegua','Mariscal Nieto','Cuchumbaya'),
('180104','1801','moquegua','Moquegua','Mariscal Nieto','Samegua'),
('180105','1801','moquegua','Moquegua','Mariscal Nieto','San Cristobal'),
('180106','1801','moquegua','Moquegua','Mariscal Nieto','Torata'),
('180107','1801','moquegua','Moquegua','Mariscal Nieto','San Antonio'),
('180201','1802','moquegua','Moquegua','General Sanchez Cerro','Omate'),
('180202','1802','moquegua','Moquegua','General Sanchez Cerro','Chojata'),
('180203','1802','moquegua','Moquegua','General Sanchez Cerro','Coalaque'),
('180204','1802','moquegua','Moquegua','General Sanchez Cerro','Ichuña'),
('180205','1802','moquegua','Moquegua','General Sanchez Cerro','La Capilla'),
('180206','1802','moquegua','Moquegua','General Sanchez Cerro','Lloque'),
('180207','1802','moquegua','Moquegua','General Sanchez Cerro','Matalaque'),
('180208','1802','moquegua','Moquegua','General Sanchez Cerro','Puquina'),
('180209','1802','moquegua','Moquegua','General Sanchez Cerro','Quinistaquillas'),
('180210','1802','moquegua','Moquegua','General Sanchez Cerro','Ubinas'),
('180211','1802','moquegua','Moquegua','General Sanchez Cerro','Yunga'),
('180301','1803','moquegua','Moquegua','Ilo','Ilo'),
('180302','1803','moquegua','Moquegua','Ilo','El Algarrobal'),
('180303','1803','moquegua','Moquegua','Ilo','Pacocha'),
('190101','1901','pasco','Pasco','Pasco','Chaupimarca'),
('190102','1901','pasco','Pasco','Pasco','Huachon'),
('190103','1901','pasco','Pasco','Pasco','Huariaca'),
('190104','1901','pasco','Pasco','Pasco','Huayllay'),
('190105','1901','pasco','Pasco','Pasco','Ninacaca'),
('190106','1901','pasco','Pasco','Pasco','Pallanchacra'),
('190107','1901','pasco','Pasco','Pasco','Paucartambo'),
('190108','1901','pasco','Pasco','Pasco','San Francisco de Asis de Yarusyacan'),
('190109','1901','pasco','Pasco','Pasco','Simon Bolivar'),
('190110','1901','pasco','Pasco','Pasco','Ticlacayan'),
('190111','1901','pasco','Pasco','Pasco','Tinyahuarco'),
('190112','1901','pasco','Pasco','Pasco','Vicco'),
('190113','1901','pasco','Pasco','Pasco','Yanacancha'),
('190201','1902','pasco','Pasco','Daniel Alcides Carrion','Yanahuanca'),
('190202','1902','pasco','Pasco','Daniel Alcides Carrion','Chacayan'),
('190203','1902','pasco','Pasco','Daniel Alcides Carrion','Goyllarisquizga'),
('190204','1902','pasco','Pasco','Daniel Alcides Carrion','Paucar'),
('190205','1902','pasco','Pasco','Daniel Alcides Carrion','San Pedro de Pillao'),
('190206','1902','pasco','Pasco','Daniel Alcides Carrion','Santa Ana de Tusi'),
('190207','1902','pasco','Pasco','Daniel Alcides Carrion','Tapuc'),
('190208','1902','pasco','Pasco','Daniel Alcides Carrion','Vilcabamba'),
('190301','1903','pasco','Pasco','Oxapampa','Oxapampa'),
('190302','1903','pasco','Pasco','Oxapampa','Chontabamba'),
('190303','1903','pasco','Pasco','Oxapampa','Huancabamba'),
('190304','1903','pasco','Pasco','Oxapampa','Palcazu'),
('190305','1903','pasco','Pasco','Oxapampa','Pozuzo'),
('190306','1903','pasco','Pasco','Oxapampa','Puerto Bermudez'),
('190307','1903','pasco','Pasco','Oxapampa','Villa Rica'),
('190308','1903','pasco','Pasco','Oxapampa','Constitucion'),
('200101','2001','piura','Piura','Piura','Piura'),
('200104','2001','piura','Piura','Piura','Castilla'),
('200105','2001','piura','Piura','Piura','Catacaos'),
('200107','2001','piura','Piura','Piura','Cura Mori'),
('200108','2001','piura','Piura','Piura','El Tallan'),
('200109','2001','piura','Piura','Piura','La Arena'),
('200110','2001','piura','Piura','Piura','La Union'),
('200111','2001','piura','Piura','Piura','Las Lomas'),
('200114','2001','piura','Piura','Piura','Tambo Grande'),
('200115','2001','piura','Piura','Piura','Veintiseis de Octubre'),
('200201','2002','piura','Piura','Ayabaca','Ayabaca'),
('200202','2002','piura','Piura','Ayabaca','Frias'),
('200203','2002','piura','Piura','Ayabaca','Jilili'),
('200204','2002','piura','Piura','Ayabaca','Lagunas'),
('200205','2002','piura','Piura','Ayabaca','Montero'),
('200206','2002','piura','Piura','Ayabaca','Pacaipampa'),
('200207','2002','piura','Piura','Ayabaca','Paimas'),
('200208','2002','piura','Piura','Ayabaca','Sapillica'),
('200209','2002','piura','Piura','Ayabaca','Sicchez'),
('200210','2002','piura','Piura','Ayabaca','Suyo'),
('200301','2003','piura','Piura','Huancabamba','Huancabamba'),
('200302','2003','piura','Piura','Huancabamba','Canchaque'),
('200303','2003','piura','Piura','Huancabamba','El Carmen de la Frontera'),
('200304','2003','piura','Piura','Huancabamba','Huarmaca'),
('200305','2003','piura','Piura','Huancabamba','Lalaquiz'),
('200306','2003','piura','Piura','Huancabamba','San Miguel de el Faique'),
('200307','2003','piura','Piura','Huancabamba','Sondor'),
('200308','2003','piura','Piura','Huancabamba','Sondorillo'),
('200401','2004','piura','Piura','Morropon','Chulucanas'),
('200402','2004','piura','Piura','Morropon','Buenos Aires'),
('200403','2004','piura','Piura','Morropon','Chalaco'),
('200404','2004','piura','Piura','Morropon','La Matanza'),
('200405','2004','piura','Piura','Morropon','Morropon'),
('200406','2004','piura','Piura','Morropon','Salitral'),
('200407','2004','piura','Piura','Morropon','San Juan de Bigote'),
('200408','2004','piura','Piura','Morropon','Santa Catalina de Mossa'),
('200409','2004','piura','Piura','Morropon','Santo Domingo'),
('200410','2004','piura','Piura','Morropon','Yamango'),
('200501','2005','piura','Piura','Paita','Paita'),
('200502','2005','piura','Piura','Paita','Amotape'),
('200503','2005','piura','Piura','Paita','Arenal'),
('200504','2005','piura','Piura','Paita','Colan'),
('200505','2005','piura','Piura','Paita','La Huaca'),
('200506','2005','piura','Piura','Paita','Tamarindo'),
('200507','2005','piura','Piura','Paita','Vichayal'),
('200601','2006','piura','Piura','Sullana','Sullana'),
('200602','2006','piura','Piura','Sullana','Bellavista'),
('200603','2006','piura','Piura','Sullana','Ignacio Escudero'),
('200604','2006','piura','Piura','Sullana','Lancones'),
('200605','2006','piura','Piura','Sullana','Marcavelica'),
('200606','2006','piura','Piura','Sullana','Miguel Checa'),
('200607','2006','piura','Piura','Sullana','Querecotillo'),
('200608','2006','piura','Piura','Sullana','Salitral'),
('200701','2007','piura','Piura','Talara','Pariñas'),
('200702','2007','piura','Piura','Talara','El Alto'),
('200703','2007','piura','Piura','Talara','La Brea'),
('200704','2007','piura','Piura','Talara','Lobitos'),
('200705','2007','piura','Piura','Talara','Los Organos'),
('200706','2007','piura','Piura','Talara','Mancora'),
('200801','2008','piura','Piura','Sechura','Sechura'),
('200802','2008','piura','Piura','Sechura','Bellavista de la Union'),
('200803','2008','piura','Piura','Sechura','Bernal'),
('200804','2008','piura','Piura','Sechura','Cristo Nos Valga'),
('200805','2008','piura','Piura','Sechura','Vice'),
('200806','2008','piura','Piura','Sechura','Rinconada Llicuar'),
('210101','2101','puno','Puno','Puno','Puno'),
('210102','2101','puno','Puno','Puno','Acora'),
('210103','2101','puno','Puno','Puno','Amantani'),
('210104','2101','puno','Puno','Puno','Atuncolla'),
('210105','2101','puno','Puno','Puno','Capachica'),
('210106','2101','puno','Puno','Puno','Chucuito'),
('210107','2101','puno','Puno','Puno','Coata'),
('210108','2101','puno','Puno','Puno','Huata'),
('210109','2101','puno','Puno','Puno','Mañazo'),
('210110','2101','puno','Puno','Puno','Paucarcolla'),
('210111','2101','puno','Puno','Puno','Pichacani'),
('210112','2101','puno','Puno','Puno','Plateria'),
('210113','2101','puno','Puno','Puno','San Antonio'),
('210114','2101','puno','Puno','Puno','Tiquillaca'),
('210115','2101','puno','Puno','Puno','Vilque'),
('210201','2102','puno','Puno','Azangaro','Azangaro'),
('210202','2102','puno','Puno','Azangaro','Achaya'),
('210203','2102','puno','Puno','Azangaro','Arapa'),
('210204','2102','puno','Puno','Azangaro','Asillo'),
('210205','2102','puno','Puno','Azangaro','Caminaca'),
('210206','2102','puno','Puno','Azangaro','Chupa'),
('210207','2102','puno','Puno','Azangaro','Jose Domingo Choquehuanca'),
('210208','2102','puno','Puno','Azangaro','Muñani'),
('210209','2102','puno','Puno','Azangaro','Potoni'),
('210210','2102','puno','Puno','Azangaro','Saman'),
('210211','2102','puno','Puno','Azangaro','San Anton'),
('210212','2102','puno','Puno','Azangaro','San Jose'),
('210213','2102','puno','Puno','Azangaro','San Juan de Salinas'),
('210214','2102','puno','Puno','Azangaro','Santiago de Pupuja'),
('210215','2102','puno','Puno','Azangaro','Tirapata'),
('210301','2103','puno','Puno','Carabaya','Macusani'),
('210302','2103','puno','Puno','Carabaya','Ajoyani'),
('210303','2103','puno','Puno','Carabaya','Ayapata'),
('210304','2103','puno','Puno','Carabaya','Coasa'),
('210305','2103','puno','Puno','Carabaya','Corani'),
('210306','2103','puno','Puno','Carabaya','Crucero'),
('210307','2103','puno','Puno','Carabaya','Ituata'),
('210308','2103','puno','Puno','Carabaya','Ollachea'),
('210309','2103','puno','Puno','Carabaya','San Gaban'),
('210310','2103','puno','Puno','Carabaya','Usicayos'),
('210401','2104','puno','Puno','Chucuito','Juli'),
('210402','2104','puno','Puno','Chucuito','Desaguadero'),
('210403','2104','puno','Puno','Chucuito','Huacullani'),
('210404','2104','puno','Puno','Chucuito','Kelluyo'),
('210405','2104','puno','Puno','Chucuito','Pisacoma'),
('210406','2104','puno','Puno','Chucuito','Pomata'),
('210407','2104','puno','Puno','Chucuito','Zepita'),
('210501','2105','puno','Puno','El Collao','Ilave'),
('210502','2105','puno','Puno','El Collao','Capazo'),
('210503','2105','puno','Puno','El Collao','Pilcuyo'),
('210504','2105','puno','Puno','El Collao','Santa Rosa'),
('210505','2105','puno','Puno','El Collao','Conduriri'),
('210601','2106','puno','Puno','Huancane','Huancane'),
('210602','2106','puno','Puno','Huancane','Cojata'),
('210603','2106','puno','Puno','Huancane','Huatasani'),
('210604','2106','puno','Puno','Huancane','Inchupalla'),
('210605','2106','puno','Puno','Huancane','Pusi'),
('210606','2106','puno','Puno','Huancane','Rosaspata'),
('210607','2106','puno','Puno','Huancane','Taraco'),
('210608','2106','puno','Puno','Huancane','Vilque Chico'),
('210701','2107','puno','Puno','Lampa','Lampa'),
('210702','2107','puno','Puno','Lampa','Cabanilla'),
('210703','2107','puno','Puno','Lampa','Calapuja'),
('210704','2107','puno','Puno','Lampa','Nicasio'),
('210705','2107','puno','Puno','Lampa','Ocuviri'),
('210706','2107','puno','Puno','Lampa','Palca'),
('210707','2107','puno','Puno','Lampa','Paratia'),
('210708','2107','puno','Puno','Lampa','Pucara'),
('210709','2107','puno','Puno','Lampa','Santa Lucia'),
('210710','2107','puno','Puno','Lampa','Vilavila'),
('210801','2108','puno','Puno','Melgar','Ayaviri'),
('210802','2108','puno','Puno','Melgar','Antauta'),
('210803','2108','puno','Puno','Melgar','Cupi'),
('210804','2108','puno','Puno','Melgar','Llalli'),
('210805','2108','puno','Puno','Melgar','Macari'),
('210806','2108','puno','Puno','Melgar','Nuñoa'),
('210807','2108','puno','Puno','Melgar','Orurillo'),
('210808','2108','puno','Puno','Melgar','Santa Rosa'),
('210809','2108','puno','Puno','Melgar','Umachiri'),
('210901','2109','puno','Puno','Moho','Moho'),
('210902','2109','puno','Puno','Moho','Conima'),
('210903','2109','puno','Puno','Moho','Huayrapata'),
('210904','2109','puno','Puno','Moho','Tilali'),
('211001','2110','puno','Puno','San Antonio de Putina','Putina'),
('211002','2110','puno','Puno','San Antonio de Putina','Ananea'),
('211003','2110','puno','Puno','San Antonio de Putina','Pedro Vilca Apaza'),
('211004','2110','puno','Puno','San Antonio de Putina','Quilcapuncu'),
('211005','2110','puno','Puno','San Antonio de Putina','Sina'),
('211101','2111','puno','Puno','San Roman','Juliaca'),
('211102','2111','puno','Puno','San Roman','Cabana'),
('211103','2111','puno','Puno','San Roman','Cabanillas'),
('211104','2111','puno','Puno','San Roman','Caracoto'),
('211105','2111','puno','Puno','San Roman','San Miguel'),
('211201','2112','puno','Puno','Sandia','Sandia'),
('211202','2112','puno','Puno','Sandia','Cuyocuyo'),
('211203','2112','puno','Puno','Sandia','Limbani'),
('211204','2112','puno','Puno','Sandia','Patambuco'),
('211205','2112','puno','Puno','Sandia','Phara'),
('211206','2112','puno','Puno','Sandia','Quiaca'),
('211207','2112','puno','Puno','Sandia','San Juan del Oro'),
('211208','2112','puno','Puno','Sandia','Yanahuaya'),
('211209','2112','puno','Puno','Sandia','Alto Inambari'),
('211210','2112','puno','Puno','Sandia','San Pedro de Putina Punco'),
('211301','2113','puno','Puno','Yunguyo','Yunguyo'),
('211302','2113','puno','Puno','Yunguyo','Anapia'),
('211303','2113','puno','Puno','Yunguyo','Copani'),
('211304','2113','puno','Puno','Yunguyo','Cuturapi'),
('211305','2113','puno','Puno','Yunguyo','Ollaraya'),
('211306','2113','puno','Puno','Yunguyo','Tinicachi'),
('211307','2113','puno','Puno','Yunguyo','Unicachi'),
('220101','2201','san-martin','San Martín','Moyobamba','Moyobamba'),
('220102','2201','san-martin','San Martín','Moyobamba','Calzada'),
('220103','2201','san-martin','San Martín','Moyobamba','Habana'),
('220104','2201','san-martin','San Martín','Moyobamba','Jepelacio'),
('220105','2201','san-martin','San Martín','Moyobamba','Soritor'),
('220106','2201','san-martin','San Martín','Moyobamba','Yantalo'),
('220201','2202','san-martin','San Martín','Bellavista','Bellavista'),
('220202','2202','san-martin','San Martín','Bellavista','Alto Biavo'),
('220203','2202','san-martin','San Martín','Bellavista','Bajo Biavo'),
('220204','2202','san-martin','San Martín','Bellavista','Huallaga'),
('220205','2202','san-martin','San Martín','Bellavista','San Pablo'),
('220206','2202','san-martin','San Martín','Bellavista','San Rafael'),
('220301','2203','san-martin','San Martín','El Dorado','San Jose de Sisa'),
('220302','2203','san-martin','San Martín','El Dorado','Agua Blanca'),
('220303','2203','san-martin','San Martín','El Dorado','San Martín'),
('220304','2203','san-martin','San Martín','El Dorado','Santa Rosa'),
('220305','2203','san-martin','San Martín','El Dorado','Shatoja'),
('220401','2204','san-martin','San Martín','Huallaga','Saposoa'),
('220402','2204','san-martin','San Martín','Huallaga','Alto Saposoa'),
('220403','2204','san-martin','San Martín','Huallaga','El Eslabon'),
('220404','2204','san-martin','San Martín','Huallaga','Piscoyacu'),
('220405','2204','san-martin','San Martín','Huallaga','Sacanche'),
('220406','2204','san-martin','San Martín','Huallaga','Tingo de Saposoa'),
('220501','2205','san-martin','San Martín','Lamas','Lamas'),
('220502','2205','san-martin','San Martín','Lamas','Alonso de Alvarado'),
('220503','2205','san-martin','San Martín','Lamas','Barranquita'),
('220504','2205','san-martin','San Martín','Lamas','Caynarachi'),
('220505','2205','san-martin','San Martín','Lamas','Cuñumbuqui'),
('220506','2205','san-martin','San Martín','Lamas','Pinto Recodo'),
('220507','2205','san-martin','San Martín','Lamas','Rumisapa'),
('220508','2205','san-martin','San Martín','Lamas','San Roque de Cumbaza'),
('220509','2205','san-martin','San Martín','Lamas','Shanao'),
('220510','2205','san-martin','San Martín','Lamas','Tabalosos'),
('220511','2205','san-martin','San Martín','Lamas','Zapatero'),
('220601','2206','san-martin','San Martín','Mariscal Caceres','Juanjui'),
('220602','2206','san-martin','San Martín','Mariscal Caceres','Campanilla'),
('220603','2206','san-martin','San Martín','Mariscal Caceres','Huicungo'),
('220604','2206','san-martin','San Martín','Mariscal Caceres','Pachiza'),
('220605','2206','san-martin','San Martín','Mariscal Caceres','Pajarillo'),
('220701','2207','san-martin','San Martín','Picota','Picota'),
('220702','2207','san-martin','San Martín','Picota','Buenos Aires'),
('220703','2207','san-martin','San Martín','Picota','Caspisapa'),
('220704','2207','san-martin','San Martín','Picota','Pilluana'),
('220705','2207','san-martin','San Martín','Picota','Pucacaca'),
('220706','2207','san-martin','San Martín','Picota','San Cristobal'),
('220707','2207','san-martin','San Martín','Picota','San Hilarion'),
('220708','2207','san-martin','San Martín','Picota','Shamboyacu'),
('220709','2207','san-martin','San Martín','Picota','Tingo de Ponasa'),
('220710','2207','san-martin','San Martín','Picota','Tres Unidos'),
('220801','2208','san-martin','San Martín','Rioja','Rioja'),
('220802','2208','san-martin','San Martín','Rioja','Awajun'),
('220803','2208','san-martin','San Martín','Rioja','Elias Soplin Vargas'),
('220804','2208','san-martin','San Martín','Rioja','Nueva Cajamarca'),
('220805','2208','san-martin','San Martín','Rioja','Pardo Miguel'),
('220806','2208','san-martin','San Martín','Rioja','Posic'),
('220807','2208','san-martin','San Martín','Rioja','San Fernando'),
('220808','2208','san-martin','San Martín','Rioja','Yorongos'),
('220809','2208','san-martin','San Martín','Rioja','Yuracyacu'),
('220901','2209','san-martin','San Martín','San Martín','Tarapoto'),
('220902','2209','san-martin','San Martín','San Martín','Alberto Leveau'),
('220903','2209','san-martin','San Martín','San Martín','Cacatachi'),
('220904','2209','san-martin','San Martín','San Martín','Chazuta'),
('220905','2209','san-martin','San Martín','San Martín','Chipurana'),
('220906','2209','san-martin','San Martín','San Martín','El Porvenir'),
('220907','2209','san-martin','San Martín','San Martín','Huimbayoc'),
('220908','2209','san-martin','San Martín','San Martín','Juan Guerra'),
('220909','2209','san-martin','San Martín','San Martín','La Banda de Shilcayo'),
('220910','2209','san-martin','San Martín','San Martín','Morales'),
('220911','2209','san-martin','San Martín','San Martín','Papaplaya'),
('220912','2209','san-martin','San Martín','San Martín','San Antonio'),
('220913','2209','san-martin','San Martín','San Martín','Sauce'),
('220914','2209','san-martin','San Martín','San Martín','Shapaja'),
('221001','2210','san-martin','San Martín','Tocache','Tocache'),
('221002','2210','san-martin','San Martín','Tocache','Nuevo Progreso'),
('221003','2210','san-martin','San Martín','Tocache','Polvora'),
('221004','2210','san-martin','San Martín','Tocache','Shunte'),
('221005','2210','san-martin','San Martín','Tocache','Uchiza'),
('221006','2210','san-martin','San Martín','Tocache','Santa Lucia'),
('230101','2301','tacna','Tacna','Tacna','Tacna'),
('230102','2301','tacna','Tacna','Tacna','Alto de la Alianza'),
('230103','2301','tacna','Tacna','Tacna','Calana'),
('230104','2301','tacna','Tacna','Tacna','Ciudad Nueva'),
('230105','2301','tacna','Tacna','Tacna','Inclan'),
('230106','2301','tacna','Tacna','Tacna','Pachia'),
('230107','2301','tacna','Tacna','Tacna','Palca'),
('230108','2301','tacna','Tacna','Tacna','Pocollay'),
('230109','2301','tacna','Tacna','Tacna','Sama'),
('230110','2301','tacna','Tacna','Tacna','Coronel Gregorio Albarracin Lanchipa'),
('230111','2301','tacna','Tacna','Tacna','La Yarada los Palos'),
('230201','2302','tacna','Tacna','Candarave','Candarave'),
('230202','2302','tacna','Tacna','Candarave','Cairani'),
('230203','2302','tacna','Tacna','Candarave','Camilaca'),
('230204','2302','tacna','Tacna','Candarave','Curibaya'),
('230205','2302','tacna','Tacna','Candarave','Huanuara'),
('230206','2302','tacna','Tacna','Candarave','Quilahuani'),
('230301','2303','tacna','Tacna','Jorge Basadre','Locumba'),
('230302','2303','tacna','Tacna','Jorge Basadre','Ilabaya'),
('230303','2303','tacna','Tacna','Jorge Basadre','Ite'),
('230401','2304','tacna','Tacna','Tarata','Tarata'),
('230402','2304','tacna','Tacna','Tarata','Heroes Albarracin'),
('230403','2304','tacna','Tacna','Tarata','Estique'),
('230404','2304','tacna','Tacna','Tarata','Estique-pampa'),
('230405','2304','tacna','Tacna','Tarata','Sitajara'),
('230406','2304','tacna','Tacna','Tarata','Susapaya'),
('230407','2304','tacna','Tacna','Tarata','Tarucachi'),
('230408','2304','tacna','Tacna','Tarata','Ticaco'),
('240101','2401','tumbes','Tumbes','Tumbes','Tumbes'),
('240102','2401','tumbes','Tumbes','Tumbes','Corrales'),
('240103','2401','tumbes','Tumbes','Tumbes','La Cruz'),
('240104','2401','tumbes','Tumbes','Tumbes','Pampas de Hospital'),
('240105','2401','tumbes','Tumbes','Tumbes','San Jacinto'),
('240106','2401','tumbes','Tumbes','Tumbes','San Juan de la Virgen'),
('240201','2402','tumbes','Tumbes','Contralmirante Villar','Zorritos'),
('240202','2402','tumbes','Tumbes','Contralmirante Villar','Casitas'),
('240203','2402','tumbes','Tumbes','Contralmirante Villar','Canoas de Punta Sal'),
('240301','2403','tumbes','Tumbes','Zarumilla','Zarumilla'),
('240302','2403','tumbes','Tumbes','Zarumilla','Aguas Verdes'),
('240303','2403','tumbes','Tumbes','Zarumilla','Matapalo'),
('240304','2403','tumbes','Tumbes','Zarumilla','Papayal'),
('250101','2501','ucayali','Ucayali','Coronel Portillo','Calleria'),
('250102','2501','ucayali','Ucayali','Coronel Portillo','Campoverde'),
('250103','2501','ucayali','Ucayali','Coronel Portillo','Iparia'),
('250104','2501','ucayali','Ucayali','Coronel Portillo','Masisea'),
('250105','2501','ucayali','Ucayali','Coronel Portillo','Yarinacocha'),
('250106','2501','ucayali','Ucayali','Coronel Portillo','Nueva Requena'),
('250107','2501','ucayali','Ucayali','Coronel Portillo','Manantay'),
('250201','2502','ucayali','Ucayali','Atalaya','Raimondi'),
('250202','2502','ucayali','Ucayali','Atalaya','Sepahua'),
('250203','2502','ucayali','Ucayali','Atalaya','Tahuania'),
('250204','2502','ucayali','Ucayali','Atalaya','Yurua'),
('250301','2503','ucayali','Ucayali','Padre Abad','Padre Abad'),
('250302','2503','ucayali','Ucayali','Padre Abad','Irazola'),
('250303','2503','ucayali','Ucayali','Padre Abad','Curimana'),
('250304','2503','ucayali','Ucayali','Padre Abad','Neshuya'),
('250305','2503','ucayali','Ucayali','Padre Abad','Alexander Von Humboldt'),
('250306','2503','ucayali','Ucayali','Padre Abad','Huipoca'),
('250307','2503','ucayali','Ucayali','Padre Abad','Boqueron'),
('250401','2504','ucayali','Ucayali','Purus','Purus');

create table app.shipping_settings (
  singleton boolean primary key default true check(singleton),
  free_threshold_cents bigint not null check(free_threshold_cents between 0 and 100000000),
  province_shipping_enabled boolean not null default false,
  national_courier_fee_cents bigint not null check(national_courier_fee_cents between 0 and 100000000),
  national_estimate text not null check(char_length(national_estimate)<=80 and (not province_shipping_enabled or btrim(national_estimate)<>'')),
  version bigint not null default 1 check(version>0),updated_at timestamptz not null default now()
);
create table app.shipping_zones (
  id text primary key check(char_length(id) between 1 and 100),
  singleton boolean not null default true references app.shipping_settings(singleton) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 120),
  department text not null,province text,district text,
  courier_fee_cents bigint not null check(courier_fee_cents between 0 and 100000000),
  motorizado_fee_cents bigint check(motorizado_fee_cents between 0 and 100000000),
  estimate text not null check(char_length(btrim(estimate)) between 1 and 80),active boolean not null,
  check(district is null or province is not null)
);
create unique index shipping_zone_location_unique on app.shipping_zones(department,coalesce(province,''),coalesce(district,''));
create table app.coupons (
  id uuid primary key default gen_random_uuid(),code text not null unique check(code ~ '^[A-Z0-9_-]{1,60}$'),
  enabled boolean not null,discount_type text not null check(discount_type in('percent','fixed')),
  value numeric(14,2) not null check(value>0 and (discount_type<>'percent' or value<=100)),
  minimum_cents bigint not null check(minimum_cents between 0 and 100000000),
  starts_at timestamptz,ends_at timestamptz,usage_limit integer check(usage_limit>0),
  used integer not null default 0 check(used>=0),version bigint not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(starts_at is null or ends_at is null or ends_at>starts_at)
);

create table app.orders (
  id uuid primary key default gen_random_uuid(),reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  operation_id uuid not null unique,tracking_hash text not null check(tracking_hash ~ '^[a-f0-9]{64}$'),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check(mode in('guest','demo-account')),simulation boolean not null default true check(simulation),
  status text not null default 'received' check(status in('received','preparing','shipped','delivered')),
  payment_status text not null default 'pending' check(payment_status='pending'),
  payment_provider text not null default 'mercado-pago' check(payment_provider='mercado-pago'),
  first_name text not null,last_name text not null,email text not null,phone text not null,
  delivery_method text not null check(delivery_method in('courier','motorizado')),
  promotion_code text,
  subtotal_cents bigint not null check(subtotal_cents between 1 and 10000000000),
  product_discount_cents bigint not null check(product_discount_cents>=0),
  discount_cents bigint not null check(discount_cents between 0 and subtotal_cents),
  shipping_cents bigint not null check(shipping_cents between 0 and 100000000),
  total_cents bigint not null check(total_cents=subtotal_cents-discount_cents+shipping_cents),
  shipping_estimate text not null,
  department text not null,province text not null,district text not null,street text not null,address_reference text not null default '',
  alternate_recipient_name text,alternate_recipient_dni text,
  version bigint not null default 1 check(version>0),placed_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check((alternate_recipient_name is null)=(alternate_recipient_dni is null))
);
create index orders_owner_placed_idx on app.orders(user_id,placed_at desc,id);
create index orders_status_placed_idx on app.orders(status,placed_at desc,id);
create table app.order_items (
  order_id uuid not null references app.orders(id) on delete cascade,position smallint not null check(position between 0 and 99),
  product_id uuid references app.products(id) on delete restrict,
  -- Catalog updates stage/reinsert presentations with the same UUID. Defer the
  -- historical FK until that transaction is complete, while rejecting removal
  -- of a presentation that already belongs to an order.
  variant_id uuid references app.product_variants(id) on delete no action deferrable initially deferred,
  media_id uuid references app.media_assets(id) on delete restrict,
  product_code text not null,merchant_sku text,product_slug text not null,image_source text not null,
  product_name text not null,brand_name text not null,ml integer,variant_label text,
  quantity integer not null check(quantity between 1 and 999),unit_price_cents bigint not null check(unit_price_cents>0),
  original_unit_price_cents bigint not null check(original_unit_price_cents>=unit_price_cents),
  primary key(order_id,position),unique(order_id,variant_id)
);
create index order_items_media_idx on app.order_items(media_id) where media_id is not null;
create table app.order_status_history (
  id uuid primary key default gen_random_uuid(),order_id uuid not null references app.orders(id) on delete cascade,
  from_status text not null,to_status text not null,changed_at timestamptz not null default now(),
  -- Verified actor identity is an immutable historical snapshot, not an Auth
  -- ownership relation. Removing an account must not erase audit attribution.
  actor_id uuid not null,actor_name text not null,
  operation_id uuid not null,source text not null check(source in('individual','bulk')),
  unique(order_id,operation_id)
);
create table app.order_delivery_history (
  id uuid primary key default gen_random_uuid(),order_id uuid not null references app.orders(id) on delete cascade,
  changed_at timestamptz not null default now(),actor_id uuid not null,
  previous_delivery jsonb not null,new_delivery jsonb not null
);
create table private.order_status_operations (
  operation_id uuid primary key,actor_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,result jsonb not null,created_at timestamptz not null default now()
);

-- Tables stay unexposed and browser roles receive no table privileges. The
-- NOLOGIN executor is reachable only through narrowly granted checked RPCs.
do $$ declare t text;begin
  foreach t in array array['commerce_locations','shipping_settings','shipping_zones','coupons','orders','order_items','order_status_history','order_delivery_history'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format('revoke all on app.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on app.%I to aro_commerce_executor',t);
    execute format('create policy commerce_executor_access on app.%I to aro_commerce_executor using(true) with check(true)',t);
  end loop;
end $$;
alter table private.order_status_operations enable row level security;
revoke all on private.order_status_operations from public,anon,authenticated,service_role;
grant select,insert on private.order_status_operations to aro_commerce_executor;
create policy commerce_executor_access on private.order_status_operations to aro_commerce_executor using(true) with check(true);
grant insert,update,delete on app.shipping_settings,app.shipping_zones,app.coupons to aro_commerce_executor;
grant insert,update on app.orders to aro_commerce_executor;
grant insert on app.order_items,app.order_status_history,app.order_delivery_history to aro_commerce_executor;
grant select on app.products,app.product_variants,app.brands,app.product_images,app.media_assets,app.product_offers,
  app.store_settings,app.profiles to aro_commerce_executor;
-- PostgreSQL row locks require an UPDATE column privilege. No commerce RPC
-- changes these columns; the grant is confined to this NOLOGIN executor.
grant update(version) on app.products,app.product_variants to aro_commerce_executor;
grant execute on function private.catalog_product_is_published(app.products),private.catalog_price_cents(bigint,boolean,text,bigint,timestamptz,timestamptz,timestamptz),private.media_source(text,text)
  to aro_commerce_executor;
create policy commerce_products_read on app.products for select to aro_commerce_executor using(true);
create policy commerce_variants_read on app.product_variants for select to aro_commerce_executor using(true);
create policy commerce_products_lock on app.products for update to aro_commerce_executor using(true) with check(true);
create policy commerce_variants_lock on app.product_variants for update to aro_commerce_executor using(true) with check(true);
create policy commerce_brands_read on app.brands for select to aro_commerce_executor using(true);
create policy commerce_images_read on app.product_images for select to aro_commerce_executor using(true);
create policy commerce_assets_read on app.media_assets for select to aro_commerce_executor using(true);
create policy commerce_offers_read on app.product_offers for select to aro_commerce_executor using(true);
create policy commerce_settings_read on app.store_settings for select to aro_commerce_executor using(true);
create policy commerce_profiles_read on app.profiles for select to aro_commerce_executor using(true);

create function private.commerce_hash(p_value text) returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(p_value,'UTF8')),'hex');
$$;
create function private.commerce_text(p_value jsonb,p_max integer,p_min integer default 1)
returns text language plpgsql immutable set search_path='' as $$
declare v text;begin
  if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Revisa los campos de texto.' using errcode='22023';end if;
  v:=btrim(p_value#>>'{}');
  if char_length(v) not between p_min and p_max or v~'[[:cntrl:]]' then raise exception 'Revisa los campos de texto.' using errcode='22023';end if;
  return v;
end $$;
create function private.commerce_integer(p_value jsonb,p_max bigint,p_min bigint default 0)
returns bigint language plpgsql immutable set search_path='' as $$
declare v bigint;begin
  if jsonb_typeof(p_value) is distinct from 'number' or (p_value#>>'{}')!~'^[0-9]{1,14}$' then raise exception 'Revisa los importes y cantidades.' using errcode='22023';end if;
  v:=(p_value#>>'{}')::bigint;
  if v not between p_min and p_max then raise exception 'Revisa los importes y cantidades.' using errcode='22023';end if;
  return v;
end $$;
create function private.commerce_location(p_department text,p_province text,p_district text)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from app.commerce_locations where department=p_department and province=p_province and district=p_district);
$$;
create function private.commerce_capital(p_department text,p_province text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce((p_department='lima' and p_province='1501') or (p_department='callao' and p_province='0701'),false);
$$;

create function private.shipping_document(p_admin boolean default false)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('freeThresholdCents',s.free_threshold_cents,'provinceShippingEnabled',s.province_shipping_enabled,
    'nationalCourierFeeCents',case when p_admin or s.province_shipping_enabled then s.national_courier_fee_cents else 0 end,
    'nationalEstimate',case when p_admin or s.province_shipping_enabled then s.national_estimate else '' end,
    'zones',coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'name',z.name,'department',z.department,'province',z.province,'district',z.district,
      'courierFeeCents',z.courier_fee_cents,'motorizadoFeeCents',z.motorizado_fee_cents,'estimate',z.estimate,'active',z.active) order by z.id)
      from app.shipping_zones z where p_admin or (z.active and (s.province_shipping_enabled or private.commerce_capital(z.department,coalesce(z.province,case z.department when 'lima' then '1501' when 'callao' then '0701' end))))),'[]'::jsonb))
  from app.shipping_settings s where singleton;
$$;
create function api.commerce_settings() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('shipping',private.shipping_document(false),'shippingVersion',coalesce((select version from app.shipping_settings where singleton),0));
$$;
create function private.coupon_document(p_id uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',id,'code',code,'active',enabled,'type',discount_type,'value',value,'minimumCents',minimum_cents,
    'startsAt',coalesce(to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),''),
    'endsAt',coalesce(to_char(ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),''),'usageLimit',usage_limit,'used',used)
  from app.coupons where id=p_id;
$$;
create function api.admin_commerce_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();
  return jsonb_build_object('shipping',private.shipping_document(true),'shippingVersion',coalesce((select version from app.shipping_settings where singleton),0),
    'coupons',coalesce((select jsonb_agg(private.coupon_document(id) order by code) from app.coupons),'[]'::jsonb),
    'couponVersions',coalesce((select jsonb_object_agg(id::text,version) from app.coupons),'{}'::jsonb));
end $$;
create function api.admin_save_shipping(p_shipping jsonb,p_expected_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_version bigint;v_zone jsonb;v_department text;v_province text;v_district text;v_key text;v_keys text[]:='{}';v_ids text[]:='{}';v_id text;
begin
  perform private.require_catalog_admin();
  perform private.home_object(p_shipping,array['freeThresholdCents','provinceShippingEnabled','nationalCourierFeeCents','nationalEstimate','zones']);
  perform private.commerce_integer(p_shipping->'freeThresholdCents',100000000);
  perform private.commerce_integer(p_shipping->'nationalCourierFeeCents',100000000);
  perform private.commerce_text(p_shipping->'nationalEstimate',80,case when p_shipping->>'provinceShippingEnabled'='true' then 1 else 0 end);
  if jsonb_typeof(p_shipping->'provinceShippingEnabled') is distinct from 'boolean' or jsonb_typeof(p_shipping->'zones') is distinct from 'array' then
    raise exception 'Revisa la cobertura y las tarifas.' using errcode='22023';end if;
  if jsonb_array_length(p_shipping->'zones')>1000 then raise exception 'Demasiadas zonas de envío.' using errcode='22023';end if;
  for v_zone in select value from jsonb_array_elements(p_shipping->'zones') loop
    perform private.home_object(v_zone,array['id','name','department','province','district','courierFeeCents','motorizadoFeeCents','estimate','active']);
    v_id:=private.commerce_text(v_zone->'id',100);perform private.commerce_text(v_zone->'name',120);perform private.commerce_text(v_zone->'estimate',80);
    v_department:=private.commerce_text(v_zone->'department',60);
    v_province:=case when v_zone->'province'='null'::jsonb then null else private.commerce_text(v_zone->'province',4,4) end;
    v_district:=case when v_zone->'district'='null'::jsonb then null else private.commerce_text(v_zone->'district',6,6) end;
    if not exists(select 1 from app.commerce_locations where department=v_department and (v_province is null or province=v_province) and (v_district is null or district=v_district))
      or (v_district is not null and v_province is null) then raise exception 'La ubicación de una tarifa no es válida.' using errcode='22023';end if;
    perform private.commerce_integer(v_zone->'courierFeeCents',100000000);
    if v_zone->'motorizadoFeeCents'<>'null'::jsonb then perform private.commerce_integer(v_zone->'motorizadoFeeCents',100000000);end if;
    if jsonb_typeof(v_zone->'active') is distinct from 'boolean' then raise exception 'Revisa el estado de una tarifa.' using errcode='22023';end if;
    v_key:=v_department||':'||coalesce(v_province,'*')||':'||coalesce(v_district,'*');
    if v_key=any(v_keys) or v_id=any(v_ids) then raise exception 'No repitas zonas ni identificadores de tarifa.' using errcode='23505';end if;
    v_keys:=array_append(v_keys,v_key);v_ids:=array_append(v_ids,v_id);
  end loop;
  perform pg_advisory_xact_lock(714482400);
  select version into v_version from app.shipping_settings where singleton for update;
  if p_expected_version is null or coalesce(v_version,0)<>p_expected_version then raise exception 'Los envíos cambiaron en otra sesión. Actualiza la página.' using errcode='PT409';end if;
  insert into app.shipping_settings(singleton,free_threshold_cents,province_shipping_enabled,national_courier_fee_cents,national_estimate)
    values(true,(p_shipping->>'freeThresholdCents')::bigint,(p_shipping->>'provinceShippingEnabled')::boolean,(p_shipping->>'nationalCourierFeeCents')::bigint,btrim(p_shipping->>'nationalEstimate'))
    on conflict(singleton) do update set free_threshold_cents=excluded.free_threshold_cents,province_shipping_enabled=excluded.province_shipping_enabled,
      national_courier_fee_cents=excluded.national_courier_fee_cents,national_estimate=excluded.national_estimate,version=app.shipping_settings.version+1,updated_at=now()
    returning version into v_version;
  delete from app.shipping_zones where singleton;
  insert into app.shipping_zones(id,name,department,province,district,courier_fee_cents,motorizado_fee_cents,estimate,active)
    select btrim(x->>'id'),btrim(x->>'name'),x->>'department',x->>'province',x->>'district',(x->>'courierFeeCents')::bigint,
      (x->>'motorizadoFeeCents')::bigint,btrim(x->>'estimate'),(x->>'active')::boolean from jsonb_array_elements(p_shipping->'zones') x;
  return jsonb_build_object('shipping',private.shipping_document(true),'publicShipping',private.shipping_document(false),'version',v_version);
end $$;

create function api.order_tracking(p_reference text,p_token text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o app.orders%rowtype;begin
  if p_reference is null or char_length(p_reference)>40 or (p_token is not null and p_token!~'^[A-Za-z0-9_-]{43,128}$') then return null;end if;
  select * into o from app.orders where reference=upper(btrim(p_reference))
    and ((user_id is not null and user_id=auth.uid()) or (p_token is not null and tracking_hash=private.commerce_hash(p_token)));
  if not found then return null;end if;
  return jsonb_build_object('reference',o.reference,'placedAt',to_char(o.placed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'status',o.status,'mode',o.mode,'simulation',true);
end $$;
create function api.customer_orders() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();begin
  if v_user is null then raise exception 'Inicia sesión para consultar tus pedidos.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId',v_user,'reference',o.reference,
    'placedAt',to_char(o.placed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status',o.status,'simulation',true,
    'lines',private.order_lines_document(o.id),'deliveryMethod',o.delivery_method,
    'address',jsonb_build_object('id',o.id,'label','Dirección del pedido','recipient',o.first_name||' '||o.last_name,
      'department',o.department,'province',o.province,'district',o.district,'street',o.street,'reference',o.address_reference),
    'payment',jsonb_build_object('provider',o.payment_provider,'status',o.payment_status),
    'subtotalCents',o.subtotal_cents,'discountCents',o.discount_cents,'shippingCents',o.shipping_cents,'totalCents',o.total_cents)
    order by o.placed_at desc,o.id) from app.orders o where user_id=v_user),'[]'::jsonb);
end $$;
create function private.order_history_document(p_ids uuid[]) returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'reference',o.reference,'fromStatus',h.from_status,'toStatus',h.to_status,
    'changedAt',to_char(h.changed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'operator',jsonb_build_object('id',h.actor_id,'name',h.actor_name,'verified',true),'operationId',h.operation_id,'source',h.source)
    order by h.changed_at,h.id),'[]'::jsonb) from app.order_status_history h join app.orders o on o.id=h.order_id where h.order_id=any(p_ids);
$$;
create function api.admin_orders(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_ids uuid[];begin
  perform private.require_catalog_admin();
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 1000000 then raise exception 'La página solicitada no es válida.' using errcode='22023';end if;
  select coalesce(array_agg(id order by placed_at desc,id),'{}'::uuid[]) into v_ids from(select id,placed_at from app.orders order by placed_at desc,id limit p_limit offset p_offset) page;
  return jsonb_build_object('orders',coalesce((select jsonb_agg(private.order_document(o.id) order by o.placed_at desc,o.id) from app.orders o where o.id=any(v_ids)),'[]'::jsonb),
    'orderHistory',private.order_history_document(v_ids),'total',(select count(*) from app.orders));
end $$;
create function api.admin_set_order_statuses(p_changes jsonb,p_status text,p_operation_id uuid,p_delivery_confirmed boolean,p_source text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_name text;v_hash text;v_existing private.order_status_operations%rowtype;
  v_change jsonb;v_reference text;v_expected bigint;o app.orders%rowtype;v_updated jsonb:='[]';v_errors jsonb:='[]';v_skipped jsonb:='[]';v_result jsonb;
  v_states text[]:=array['received','preparing','shipped','delivered'];v_seen text[]:='{}';
begin
  perform private.require_catalog_admin();
  if p_operation_id is null or p_status is null or not p_status=any(v_states) or p_source is null or p_source not in('individual','bulk')
    or jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'La actualización de pedidos no es válida.' using errcode='22023';end if;
  if jsonb_array_length(p_changes) not between 1 and 100 then raise exception 'Selecciona entre uno y cien pedidos.' using errcode='22023';end if;
  v_hash:=private.commerce_hash(jsonb_build_object('changes',p_changes,'status',p_status,'deliveryConfirmed',p_delivery_confirmed,'source',p_source)::text);
  perform pg_advisory_xact_lock(hashtextextended('order-status:'||p_operation_id::text,0));
  select * into v_existing from private.order_status_operations where operation_id=p_operation_id;
  if found then
    if v_existing.actor_id<>v_actor then raise exception 'La operación pertenece a otro administrador.' using errcode='42501';end if;
    if v_existing.request_hash<>v_hash then raise exception 'La operación ya registra otros cambios.' using errcode='PT409';end if;
    return v_existing.result;
  end if;
  select coalesce(nullif(btrim(first_name||' '||last_name),''),'Administrador') into v_name from app.profiles where user_id=v_actor;
  v_name:=coalesce(v_name,'Administrador');
  for v_change in select value from jsonb_array_elements(p_changes) order by value->>'reference' loop
    begin
      perform private.home_object(v_change,array['reference','expectedVersion']);
      v_reference:=private.commerce_text(v_change->'reference',40);v_expected:=private.commerce_integer(v_change->'expectedVersion',9007199254740991,1);
      if v_reference=any(v_seen) then continue;end if;v_seen:=array_append(v_seen,v_reference);
      select * into o from app.orders where reference=v_reference for update;
      if not found then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','El pedido ya no está disponible.'));continue;end if;
      if o.version<>v_expected then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','El pedido cambió en otra sesión. Actualiza la lista.'));continue;end if;
      if o.status=p_status then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','El pedido ya tiene este estado.'));continue;end if;
      if abs(array_position(v_states,o.status)-array_position(v_states,p_status))<>1 then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','Actualiza el pedido un paso a la vez.'));continue;end if;
      if not o.simulation and o.payment_status<>'approved' then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','El pago debe estar aprobado antes de preparar el pedido.'));continue;end if;
      if p_status='delivered' and p_delivery_confirmed is distinct from true then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','Confirma la entrega antes de marcar el pedido como entregado.'));continue;end if;
      update app.orders set status=p_status,version=version+1,updated_at=now() where id=o.id;
      insert into app.order_status_history(order_id,from_status,to_status,actor_id,actor_name,operation_id,source)
        values(o.id,o.status,p_status,v_actor,v_name,p_operation_id,p_source);
      v_updated:=v_updated||jsonb_build_array(v_reference);
    exception when invalid_text_representation or numeric_value_out_of_range or check_violation or sqlstate '22023' then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',coalesce(v_change->>'reference',''),'message','Revisa los datos del pedido seleccionado.'));
    end;
  end loop;
  -- Return the same transaction's canonical rows. A follow-up network failure
  -- must not turn an already committed status update into an apparent failure.
  v_result:=jsonb_build_object('kind','updated','operationId',p_operation_id,'updated',v_updated,'skipped',v_skipped,'errors',v_errors,
    'orders',coalesce((select jsonb_agg(private.order_document(o2.id) order by o2.reference) from app.orders o2
      where o2.reference in(select x->>'reference' from jsonb_array_elements(p_changes) x)),'[]'::jsonb),
    'orderHistory',private.order_history_document(array(select o3.id from app.orders o3
      where o3.reference in(select x->>'reference' from jsonb_array_elements(p_changes) x))));
  insert into private.order_status_operations(operation_id,actor_id,request_hash,result) values(p_operation_id,v_actor,v_hash,v_result);
  return v_result;
end $$;
create function api.admin_save_order_delivery(p_reference text,p_expected_version bigint,p_address jsonb,p_contact_phone text,p_alternate_recipient jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare o app.orders%rowtype;v_department text;v_province text;v_district text;v_street text;v_reference text;v_phone text;v_name text;v_dni text;v_before jsonb;
begin
  perform private.require_catalog_admin();
  perform private.home_object(p_address,array['department','province','district','street'],array['reference']);
  v_department:=private.commerce_text(p_address->'department',60);v_province:=private.commerce_text(p_address->'province',4,4);v_district:=private.commerce_text(p_address->'district',6,6);
  v_street:=private.commerce_text(p_address->'street',240,5);v_reference:=private.commerce_text(coalesce(p_address->'reference','""'::jsonb),240,0);
  v_phone:=private.commerce_text(to_jsonb(p_contact_phone),20,9);
  if v_phone!~'^[+0-9 ()-]{9,20}$' or not private.commerce_location(v_department,v_province,v_district) then raise exception 'Revisa el teléfono y la dirección de entrega.' using errcode='22023';end if;
  if p_alternate_recipient is not null and p_alternate_recipient<>'null'::jsonb then
    perform private.home_object(p_alternate_recipient,array['name','dni']);
    v_name:=private.commerce_text(p_alternate_recipient->'name',100,2);v_dni:=private.commerce_text(p_alternate_recipient->'dni',8,8);
    if v_dni!~'^[0-9]{8}$' then raise exception 'El DNI del destinatario debe tener ocho dígitos.' using errcode='22023';end if;
  end if;
  select * into o from app.orders where reference=p_reference for update;
  if not found or p_expected_version is distinct from o.version then raise exception 'El pedido cambió en otra sesión. Actualiza la página.' using errcode='PT409';end if;
  if o.status in('shipped','delivered') then raise exception 'La entrega ya está en curso. No cambies su dirección desde este formulario.' using errcode='22023';end if;
  v_before:=private.order_document(o.id)->'address'||jsonb_build_object('contactPhone',o.phone,'alternateRecipient',private.order_document(o.id)->'alternateRecipient');
  update app.orders set department=v_department,province=v_province,district=v_district,street=v_street,address_reference=v_reference,
    phone=v_phone,alternate_recipient_name=v_name,alternate_recipient_dni=v_dni,version=version+1,updated_at=now() where id=o.id;
  insert into app.order_delivery_history(order_id,actor_id,previous_delivery,new_delivery)
    values(o.id,auth.uid(),v_before,private.order_document(o.id)->'address'||jsonb_build_object('contactPhone',v_phone,'alternateRecipient',private.order_document(o.id)->'alternateRecipient'));
  return jsonb_build_object('order',private.order_document(o.id));
end $$;

create function api.admin_save_coupon(p_coupon jsonb,p_expected_version bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_version bigint;v_code text;v_type text;v_value numeric;v_starts timestamptz;v_ends timestamptz;v_limit integer;
begin
  perform private.require_catalog_admin();
  perform private.home_object(p_coupon,array['id','code','active','type','value','minimumCents','startsAt','endsAt','usageLimit']);
  v_id:=(p_coupon->>'id')::uuid;v_code:=upper(private.commerce_text(p_coupon->'code',60));v_type:=private.commerce_text(p_coupon->'type',10);
  if jsonb_typeof(p_coupon->'active') is distinct from 'boolean' or v_code!~'^[A-Z0-9_-]{1,60}$' or v_type not in('percent','fixed')
    or jsonb_typeof(p_coupon->'value') is distinct from 'number' or (p_coupon->>'value')!~'^[0-9]{1,10}([.][0-9]{1,2})?$' then raise exception 'Revisa el código y descuento del cupón.' using errcode='22023';end if;
  v_value:=(p_coupon->>'value')::numeric;
  if v_value<=0 or (v_type='percent' and v_value>100) then raise exception 'El descuento del cupón no es válido.' using errcode='22023';end if;
  perform private.commerce_integer(p_coupon->'minimumCents',100000000);
  perform private.commerce_text(p_coupon->'startsAt',40,0);perform private.commerce_text(p_coupon->'endsAt',40,0);
  v_starts:=nullif(p_coupon->>'startsAt','')::timestamptz;v_ends:=nullif(p_coupon->>'endsAt','')::timestamptz;
  if (v_starts is not null and not isfinite(v_starts)) or (v_ends is not null and not isfinite(v_ends)) or (v_starts is not null and v_ends<=v_starts) then raise exception 'Revisa las fechas del cupón.' using errcode='22023';end if;
  if p_coupon->'usageLimit'<>'null'::jsonb then v_limit:=private.commerce_integer(p_coupon->'usageLimit',2147483647,1)::integer;end if;
  perform pg_advisory_xact_lock(714482401);
  select version into v_version from app.coupons where id=v_id for update;
  if p_expected_version is null or coalesce(v_version,0)<>p_expected_version then raise exception 'El cupón cambió en otra sesión. Actualiza la página.' using errcode='PT409';end if;
  insert into app.coupons(id,code,enabled,discount_type,value,minimum_cents,starts_at,ends_at,usage_limit)
    values(v_id,v_code,(p_coupon->>'active')::boolean,v_type,v_value,(p_coupon->>'minimumCents')::bigint,v_starts,v_ends,v_limit)
    on conflict(id) do update set code=excluded.code,enabled=excluded.enabled,discount_type=excluded.discount_type,value=excluded.value,
      minimum_cents=excluded.minimum_cents,starts_at=excluded.starts_at,ends_at=excluded.ends_at,usage_limit=excluded.usage_limit,version=app.coupons.version+1,updated_at=now()
    returning version into v_version;
  return jsonb_build_object('coupon',private.coupon_document(v_id),'version',v_version);
end $$;
create function api.admin_delete_coupon(p_id uuid,p_expected_version bigint) returns void language plpgsql security definer set search_path='' as $$
declare v_version bigint;begin
  perform private.require_catalog_admin();select version into v_version from app.coupons where id=p_id for update;
  if v_version is null or p_expected_version is distinct from v_version then raise exception 'El cupón cambió en otra sesión. Actualiza la página.' using errcode='PT409';end if;
  delete from app.coupons where id=p_id;
end $$;

create function private.shipping_quote(p_department text,p_province text,p_district text,p_method text,p_subtotal bigint)
returns jsonb language plpgsql stable set search_path='' as $$
declare s app.shipping_settings%rowtype;z app.shipping_zones%rowtype;v_capital boolean;v_fee bigint;v_free boolean;v_estimate text;
begin
  if p_method not in('courier','motorizado') then raise exception 'Selecciona una modalidad de entrega válida.' using errcode='22023';end if;
  if coalesce(p_department,'')='' then return jsonb_build_object('kind','pending');end if;
  select * into s from app.shipping_settings where singleton;
  if not found then return jsonb_build_object('kind','unavailable');end if;
  if coalesce(p_province,'')='' or coalesce(p_district,'')='' then return jsonb_build_object('kind','pending');end if;
  if not private.commerce_location(p_department,p_province,p_district) then return jsonb_build_object('kind','unavailable');end if;
  v_capital:=private.commerce_capital(p_department,p_province);
  if not v_capital and (not s.province_shipping_enabled or p_method='motorizado') then return jsonb_build_object('kind','unavailable');end if;
  select * into z from app.shipping_zones where active and department=p_department
    and (province is null or province=p_province) and (district is null or district=p_district)
    and (not v_capital or province is not null or district is not null)
    order by (district is not null) desc,(province is not null) desc,id limit 1;
  if not found and v_capital then
    select * into z from app.shipping_zones where active and department=p_department and district is null
      and (province=p_province or province is null) order by (province is not null) desc,id limit 1;
    if not found and p_department='callao' then
      select * into z from app.shipping_zones where active and department='lima' and district is null
        and (province='1501' or province is null) order by (province is not null) desc,id limit 1;
    end if;
  end if;
  if z.id is null then
    v_fee:=case when p_method='courier' then s.national_courier_fee_cents else null end;v_estimate:=s.national_estimate;
  else
    v_fee:=case p_method when 'courier' then z.courier_fee_cents else z.motorizado_fee_cents end;v_estimate:=z.estimate;
  end if;
  if v_fee is null then return jsonb_build_object('kind','unavailable');end if;
  v_free:=s.free_threshold_cents>0 and p_subtotal>=s.free_threshold_cents;
  return jsonb_build_object('kind','quoted','region',case when v_capital then 'capital' else 'province' end,
    'feeCents',case when v_free then 0 else v_fee end,'estimate',v_estimate,'free',v_free);
end $$;
create function private.coupon_quote(p_code text,p_subtotal bigint,p_has_offers boolean)
returns jsonb language plpgsql stable set search_path='' as $$
declare c app.coupons%rowtype;v_code text:=upper(btrim(coalesce(p_code,'')));v_discount bigint;
begin
  if v_code='' then return null;end if;
  if char_length(v_code)>60 then raise exception 'El código del cupón es demasiado largo.' using errcode='22023';end if;
  if p_has_offers then return jsonb_build_object('kind','incompatible','message','Los códigos no se combinan con productos en oferta.');end if;
  select * into c from app.coupons where code=v_code;
  if not found then return jsonb_build_object('kind','not-found','message','No encontramos ese código.');end if;
  if not c.enabled then return jsonb_build_object('kind','inactive','message','Este código no está activo.');end if;
  if c.starts_at>now() then return jsonb_build_object('kind','not-started','message','Este código aún no está disponible.');end if;
  if c.ends_at<=now() then return jsonb_build_object('kind','expired','message','Este código venció.');end if;
  if c.usage_limit is not null and c.used>=c.usage_limit then return jsonb_build_object('kind','limit-reached','message','Este código alcanzó su límite de usos.');end if;
  if p_subtotal<c.minimum_cents then return jsonb_build_object('kind','minimum-not-met','message','La compra no alcanza el mínimo de este código.');end if;
  v_discount:=least(p_subtotal,round(case when c.discount_type='percent' then p_subtotal*c.value/100 else c.value*100 end)::bigint);
  return jsonb_build_object('kind','applied','code',c.code,'discountCents',v_discount,'message','Código aplicado.');
end $$;
create function api.checkout_quote(p_lines jsonb,p_department text,p_province text,p_district text,p_delivery_method text,p_code text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_line jsonb;v_variant uuid;v_quantity integer;v_seen uuid[]:='{}';p app.products%rowtype;v app.product_variants%rowtype;
  o app.product_offers%rowtype;m app.media_assets%rowtype;v_brand text;v_final bigint;v_subtotal bigint:=0;v_product_discount bigint:=0;
  v_discount bigint:=0;v_lines jsonb:='[]';v_shipping jsonb;v_promotion jsonb;v_result jsonb;v_versions jsonb:='[]';
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Revisa los productos de tu carrito.' using errcode='22023';end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'El carrito debe contener entre uno y cien productos.' using errcode='22023';end if;
  if char_length(coalesce(p_department,''))>60 or char_length(coalesce(p_province,''))>4 or char_length(coalesce(p_district,''))>6 then raise exception 'La ubicación no es válida.' using errcode='22023';end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    perform private.home_object(v_line,array['variantId','quantity']);
    v_variant:=(v_line->>'variantId')::uuid;v_quantity:=private.commerce_integer(v_line->'quantity',999,1)::integer;
    if v_variant is null or v_variant=any(v_seen) then raise exception 'No repitas presentaciones en el carrito.' using errcode='22023';end if;
    v_seen:=array_append(v_seen,v_variant);
    select * into v from app.product_variants where id=v_variant;
    if not found or not v.active or v.stock<v_quantity or v.price_cents<=0 then raise exception 'Una presentación ya no tiene disponibilidad suficiente. Revisa el carrito.' using errcode='22023';end if;
    select * into p from app.products where id=v.product_id;
    if p.id is null or not private.catalog_product_is_published(p) then raise exception 'Uno de los productos ya no está disponible.' using errcode='22023';end if;
    select * into o from app.product_offers where product_id=p.id;
    v_final:=private.catalog_price_cents(v.price_cents,o.enabled,o.discount_type,o.value,o.starts_at,o.ends_at,now());
    select a.* into m from app.product_images i join app.media_assets a on a.id=i.media_id where i.product_id=p.id and i.position=0;
    select name into v_brand from app.brands where id=p.brand_id;
    v_subtotal:=v_subtotal+v_final*v_quantity;v_product_discount:=v_product_discount+(v.price_cents-v_final)*v_quantity;
    if v_subtotal>10000000000 then raise exception 'El carrito supera el importe permitido.' using errcode='22023';end if;
    v_lines:=v_lines||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('variantId',v.id,'productSlug',p.slug,
      'image',private.media_source(m.storage_kind,m.object_key),'name',p.name,'brand',coalesce(v_brand,''),'ml',v.ml,
      'variantLabel',v.label,'quantity',v_quantity,'unitPriceCents',v_final,
      'originalUnitPriceCents',case when v_final<v.price_cents then v.price_cents end))||jsonb_build_object('ml',v.ml));
    v_versions:=v_versions||jsonb_build_array(jsonb_build_object('productId',p.id,'productVersion',p.version,'variantId',v.id,'variantVersion',v.version));
  end loop;
  v_shipping:=private.shipping_quote(p_department,p_province,p_district,p_delivery_method,v_subtotal);
  v_promotion:=private.coupon_quote(p_code,v_subtotal,v_product_discount>0);
  if v_promotion->>'kind'='applied' then v_discount:=(v_promotion->>'discountCents')::bigint;end if;
  v_result:=jsonb_build_object('lines',v_lines,'subtotalCents',v_subtotal,'productDiscountCents',v_product_discount,
    'discountCents',v_discount,'shipping',v_shipping,'promotion',v_promotion,
    'totalCents',case when v_shipping->>'kind'='quoted' then v_subtotal-v_discount+(v_shipping->>'feeCents')::bigint end,'simulation',true);
  return v_result||jsonb_build_object('quoteHash',private.commerce_hash((v_result||jsonb_build_object('versions',v_versions,
    'shippingVersion',coalesce((select version from app.shipping_settings where singleton),0),
    'couponVersion',coalesce((select version from app.coupons where code=upper(btrim(p_code))),0),
    'destination',jsonb_build_array(p_department,p_province,p_district,p_delivery_method)))::text));
end $$;

create function private.order_lines_document(p_id uuid) returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('variantId',variant_id,'name',product_name,'brand',brand_name,'ml',ml,
    'variantLabel',variant_label,'productSlug',product_slug,'image',image_source,'quantity',quantity,'unitPriceCents',unit_price_cents,
    'originalUnitPriceCents',case when original_unit_price_cents>unit_price_cents then original_unit_price_cents end))||jsonb_build_object('ml',ml) order by position),'[]'::jsonb)
  from app.order_items where order_id=p_id;
$$;
create function private.order_document(p_id uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',id,'reference',reference,'mode',mode,'simulation',true,'isTest',true,'placedAt',to_char(placed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'status',status,'paymentStatus',payment_status,'version',version,
    'contact',jsonb_build_object('firstName',first_name,'lastName',last_name,'email',email,'phone',phone),
    'customerId',coalesce(user_id::text,'guest-'||id::text),'customerName',first_name||' '||last_name,'customerEmail',email,'contactPhone',phone,
    'address',jsonb_build_object('department',department,'province',province,'district',district,'street',street,'reference',address_reference),
    'alternateRecipient',case when alternate_recipient_name is not null then jsonb_build_object('name',alternate_recipient_name,'dni',alternate_recipient_dni) end,
    'deliveryMethod',delivery_method,'paymentProvider',payment_provider,'promotionCode',promotion_code,
    'lines',private.order_lines_document(id),'subtotalCents',subtotal_cents,'productDiscountCents',product_discount_cents,
    'discountCents',discount_cents,'shippingCents',shipping_cents,'totalCents',total_cents)
  from app.orders where id=p_id;
$$;
create function api.create_simulated_order(p_operation_id uuid,p_tracking_token text,p_checkout jsonb,p_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_existing app.orders%rowtype;v_order uuid;v_reference text;v_request_hash text;v_tracking_hash text;v_quote jsonb;v_contact jsonb;v_address jsonb;
  v_first text;v_last text;v_email text;v_phone text;v_department text;v_province text;v_district text;v_street text;v_address_reference text;
  v_alternate_name text;v_alternate_dni text;v_method text;v_line jsonb;v_lock record;v_position integer:=0;v_variant app.product_variants%rowtype;v_product app.products%rowtype;v_media uuid;
begin
  -- Only the trusted Worker service credential receives EXECUTE. user_id is
  -- supplied by verified Auth, never copied from the browser's checkout JSON.
  if p_operation_id is null or p_tracking_token is null or p_tracking_token!~'^[A-Za-z0-9_-]{43,128}$' then raise exception 'La operación de compra no es válida.' using errcode='22023';end if;
  if p_user_id is not null and not exists(select 1 from auth.users where id=p_user_id) then raise exception 'La cuenta ya no está disponible.' using errcode='42501';end if;
  perform private.home_object(p_checkout,array['lines','contact','address','alternateRecipient','deliveryMethod','promotionCode','expectedQuoteHash']);
  if pg_column_size(p_checkout)>65536 then raise exception 'La solicitud supera el límite permitido.' using errcode='22023';end if;
  v_tracking_hash:=private.commerce_hash(p_tracking_token);v_request_hash:=private.commerce_hash(p_checkout::text);
  perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_operation_id::text,0));
  select * into v_existing from app.orders where operation_id=p_operation_id;
  if found then
    if v_existing.user_id is distinct from p_user_id or v_existing.tracking_hash<>v_tracking_hash then raise exception 'La operación pertenece a otra sesión.' using errcode='42501';end if;
    if v_existing.request_hash<>v_request_hash then raise exception 'La operación ya registra otros datos. Revisa el pedido antes de reintentar.' using errcode='PT409';end if;
    return jsonb_build_object('order',private.order_document(v_existing.id));
  end if;
  v_contact:=p_checkout->'contact';v_address:=p_checkout->'address';
  perform private.home_object(v_contact,array['firstName','lastName','email','phone']);
  perform private.home_object(v_address,array['department','province','district','street'],array['reference']);
  v_first:=private.commerce_text(v_contact->'firstName',80,2);v_last:=private.commerce_text(v_contact->'lastName',80,2);
  v_email:=lower(private.commerce_text(v_contact->'email',254,5));v_phone:=private.commerce_text(v_contact->'phone',20,9);
  if v_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or v_phone!~'^[+0-9 ()-]{9,20}$' then raise exception 'Revisa el correo y celular del comprador.' using errcode='22023';end if;
  v_department:=private.commerce_text(v_address->'department',60);v_province:=private.commerce_text(v_address->'province',4,4);v_district:=private.commerce_text(v_address->'district',6,6);
  v_street:=private.commerce_text(v_address->'street',240,5);v_address_reference:=private.commerce_text(coalesce(v_address->'reference','""'::jsonb),240,0);
  if not private.commerce_location(v_department,v_province,v_district) then raise exception 'Selecciona una ubicación de entrega válida.' using errcode='22023';end if;
  v_method:=private.commerce_text(p_checkout->'deliveryMethod',20);
  if p_checkout->'alternateRecipient'<>'null'::jsonb then
    perform private.home_object(p_checkout->'alternateRecipient',array['name','dni']);
    v_alternate_name:=private.commerce_text(p_checkout->'alternateRecipient'->'name',100,2);v_alternate_dni:=private.commerce_text(p_checkout->'alternateRecipient'->'dni',8,8);
    if v_alternate_dni!~'^[0-9]{8}$' then raise exception 'El DNI del destinatario debe tener ocho dígitos.' using errcode='22023';end if;
  end if;
  if p_checkout->'promotionCode'<>'null'::jsonb then perform private.commerce_text(p_checkout->'promotionCode',60);end if;
  if jsonb_typeof(p_checkout->'lines') is distinct from 'array' or jsonb_array_length(p_checkout->'lines') not between 1 and 100 then raise exception 'Revisa el carrito.' using errcode='22023';end if;
  -- Read locks coordinate with price/stock edits. This simulation does not
  -- reserve or decrement a single unit and never creates coupon redemptions.
  for v_lock in select p.id from app.products p where p.id in(select product_id from app.product_variants where id in(select (x->>'variantId')::uuid from jsonb_array_elements(p_checkout->'lines') x)) order by p.id loop
    perform 1 from app.products where id=v_lock.id for share;
  end loop;
  for v_lock in select id from app.product_variants where id in(select (x->>'variantId')::uuid from jsonb_array_elements(p_checkout->'lines') x) order by id loop
    perform 1 from app.product_variants where id=v_lock.id for share;
  end loop;
  perform 1 from app.shipping_settings where singleton for share;
  perform 1 from app.coupons where code=upper(btrim(p_checkout->>'promotionCode')) for share;
  v_quote:=api.checkout_quote(p_checkout->'lines',v_department,v_province,v_district,v_method,p_checkout->>'promotionCode');
  if v_quote->>'quoteHash' is distinct from p_checkout->>'expectedQuoteHash' then raise exception 'Los precios o condiciones cambiaron. Revisa el resumen antes de continuar.' using errcode='PT409';end if;
  if v_quote->'shipping'->>'kind'<>'quoted' or v_quote->'totalCents'='null'::jsonb then raise exception 'La modalidad de envío no está disponible para esa ubicación.' using errcode='22023';end if;
  if p_checkout->>'promotionCode' is not null and v_quote->'promotion'->>'kind' is distinct from 'applied' then raise exception 'El cupón ya no es válido. Revisa el resumen.' using errcode='22023';end if;
  v_order:=gen_random_uuid();v_reference:='AI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into app.orders(id,reference,user_id,operation_id,tracking_hash,request_hash,mode,first_name,last_name,email,phone,delivery_method,promotion_code,
    subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,shipping_estimate,department,province,district,street,address_reference,alternate_recipient_name,alternate_recipient_dni)
    values(v_order,v_reference,p_user_id,p_operation_id,v_tracking_hash,v_request_hash,case when p_user_id is null then 'guest' else 'demo-account' end,
      v_first,v_last,v_email,v_phone,v_method,v_quote->'promotion'->>'code',(v_quote->>'subtotalCents')::bigint,(v_quote->>'productDiscountCents')::bigint,
      (v_quote->>'discountCents')::bigint,(v_quote->'shipping'->>'feeCents')::bigint,(v_quote->>'totalCents')::bigint,v_quote->'shipping'->>'estimate',
      v_department,v_province,v_district,v_street,v_address_reference,v_alternate_name,v_alternate_dni);
  for v_line in select value from jsonb_array_elements(v_quote->'lines') loop
    select * into v_variant from app.product_variants where id=(v_line->>'variantId')::uuid;
    select * into v_product from app.products where id=v_variant.product_id;
    select media_id into v_media from app.product_images where product_id=v_product.id and position=0;
    perform 1 from app.media_assets where id=v_media and status='ready' for update;
    if not found then raise exception 'La imagen del producto ya no está disponible. Actualiza el carrito.' using errcode='PT409';end if;
    insert into app.order_items(order_id,position,product_id,variant_id,media_id,product_code,merchant_sku,product_slug,image_source,product_name,brand_name,ml,variant_label,quantity,unit_price_cents,original_unit_price_cents)
      values(v_order,v_position,v_product.id,v_variant.id,v_media,v_product.product_code,v_variant.merchant_sku,v_line->>'productSlug',v_line->>'image',v_line->>'name',v_line->>'brand',
        v_variant.ml,v_variant.label,(v_line->>'quantity')::integer,(v_line->>'unitPriceCents')::bigint,coalesce((v_line->>'originalUnitPriceCents')::bigint,(v_line->>'unitPriceCents')::bigint));
    v_position:=v_position+1;
  end loop;
  return jsonb_build_object('order',private.order_document(v_order));
end $$;

-- Historical order images remain referenced even when a merchant replaces a
-- product gallery. No background cleanup can erase a purchased-line image.
grant select on app.order_items to aro_media_executor;
grant update(retire_after) on app.media_assets to aro_commerce_executor;
create policy commerce_assets_lock on app.media_assets for update to aro_commerce_executor using(true) with check(true);
create policy order_media_retention_read on app.order_items for select to aro_media_executor using(true);
create or replace function private.media_has_references(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from app.product_images where media_id=p_id)
    or exists(select 1 from app.products where olfactory_media_id=p_id)
    or exists(select 1 from app.home_media where media_id=p_id)
    or exists(select 1 from app.order_items where media_id=p_id);
$$;
do $$ declare v_definition text;v_marker text:='if tg_table_name in (''product_images'',''home_media'') then';begin
  v_definition:=pg_get_functiondef('private.media_reference_retention()'::regprocedure);
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected retention trigger boundary';end if;
  execute replace(v_definition,v_marker,'if tg_table_name in (''product_images'',''home_media'',''order_items'') then');
end $$;
create trigger order_item_media_retention after insert or update or delete on app.order_items for each row execute function private.media_reference_retention();

-- Extend existing bounded metadata projections; no extra public request and
-- no coupon listing is introduced into the catalog API.
do $$ declare v_definition text;v_marker text;begin
  v_definition:=pg_get_functiondef('api.catalog_settings()'::regprocedure);
  v_marker:='''homeVersion'',coalesce((select version from app.home_document where singleton),0))';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected catalog settings projection';end if;
  execute replace(v_definition,v_marker,'''homeVersion'',coalesce((select version from app.home_document where singleton),0),''shipping'',private.shipping_document(false),''shippingVersion'',coalesce((select version from app.shipping_settings where singleton),0))');
  v_definition:=pg_get_functiondef('api.catalog_browse(jsonb,integer)'::regprocedure);
  v_marker:='''homeVersion'',coalesce((select version from app.home_document where singleton),0),';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected catalog browse metadata projection';end if;
  execute replace(v_definition,v_marker,'''homeVersion'',coalesce((select version from app.home_document where singleton),0),''shipping'',private.shipping_document(false),''shippingVersion'',coalesce((select version from app.shipping_settings where singleton),0),');
end $$;
grant select on app.shipping_settings,app.shipping_zones to aro_api_executor;
create policy public_shipping_settings on app.shipping_settings for select to aro_api_executor using(true);
create policy public_shipping_zones on app.shipping_zones for select to aro_api_executor using(true);

-- Freeze ownership and privileges after all helpers exist. Browser roles have
-- only explicitly enumerated reads/administrative commands. Creation requires
-- the Worker-only service credential; guests never receive write EXECUTE.
grant create on schema api,private to aro_commerce_executor;
do $$ declare r record;begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in('commerce_hash','commerce_text','commerce_integer','commerce_location','commerce_capital','shipping_document','coupon_document','shipping_quote','coupon_quote','order_lines_document','order_document','order_history_document'))
      or(n.nspname='api' and p.proname in('commerce_settings','admin_commerce_settings','admin_save_shipping','admin_save_coupon','admin_delete_coupon','checkout_quote','create_simulated_order','order_tracking','customer_orders','admin_orders','admin_set_order_statuses','admin_save_order_delivery')) loop
    execute format('alter function %s owner to aro_commerce_executor',r.signature);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  end loop;
end $$;
revoke create on schema api,private from aro_commerce_executor;
grant execute on function private.home_object(jsonb,text[],text[]) to aro_commerce_executor;
grant execute on function private.shipping_document(boolean),private.commerce_capital(text,text) to aro_api_executor;
grant execute on function api.commerce_settings(),api.checkout_quote(jsonb,text,text,text,text,text),api.order_tracking(text,text) to anon,authenticated;
grant execute on function api.customer_orders(),api.admin_commerce_settings(),api.admin_save_shipping(jsonb,bigint),api.admin_save_coupon(jsonb,bigint),
  api.admin_delete_coupon(uuid,bigint),api.admin_orders(integer,integer),api.admin_set_order_statuses(jsonb,text,uuid,boolean,text),
  api.admin_save_order_delivery(text,bigint,jsonb,text,jsonb) to authenticated;
grant execute on function api.create_simulated_order(uuid,text,jsonb,uuid) to service_role;
