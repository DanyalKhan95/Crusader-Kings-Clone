/** Given names for generated characters, by family of cultures. Period-appropriate for c. 1000–1200. */

interface NameList {
  male: string[];
  female: string[];
}

const L = (male: string, female: string): NameList => ({ male: male.split(','), female: female.split(',') });

const FAMILIES: Record<string, NameList> = {
  english: L(
    'Harold,Edwin,Morcar,Godwin,Leofric,Aelfric,Edgar,Edmund,Oswald,Wulfstan,Aethelred,Alfred,Edward,Gyrth,Leofwine,Waltheof,Siward,Osbern,Cynric,Beorn',
    'Edith,Gytha,Aelfgifu,Godgifu,Aethelflaed,Wulfrun,Ealdgyth,Leofrun,Eadgifu,Mildred',
  ),
  frankish: L(
    'William,Robert,Richard,Hugh,Odo,Geoffrey,Philip,Henry,Baldwin,Raymond,Guy,Roger,Walter,Ralph,Eustace,Alan,Stephen,Fulk,Theobald,Aimery',
    'Matilda,Adela,Emma,Agnes,Constance,Ermengarde,Alice,Bertha,Cecily,Isabella',
  ),
  celtic: L(
    'Malcolm,Donald,Duncan,Lulach,Brian,Donnchad,Toirdelbach,Conchobar,Gruffydd,Rhys,Owain,Cadwgan,Bleddyn,Hoel,Conan,Muirchertach',
    'Margaret,Gruoch,Ethne,Nest,Gormflaith,Angharad,Mor,Derbforgaill',
  ),
  iberian: L(
    'Sancho,Alfonso,Garcia,Ramiro,Fernando,Pedro,Rodrigo,Diego,Gonzalo,Ramon,Berenguer,Inigo,Fortun,Vermudo,Ordono,Nuno',
    'Urraca,Elvira,Sancha,Teresa,Jimena,Mayor,Estefania,Toda,Almodis',
  ),
  italian: L(
    'Guido,Ugo,Landolfo,Pandolfo,Gisulf,Bonifacio,Alberto,Enrico,Ottone,Guglielmo,Lotario,Adalberto,Arduino,Ranieri,Domenico,Pietro,Giovanni,Vitale',
    'Beatrice,Matilde,Adelaide,Berta,Gisella,Sichelgaita,Imilla,Teodora',
  ),
  german: L(
    'Heinrich,Otto,Konrad,Rudolf,Berthold,Ludwig,Friedrich,Hermann,Welf,Ekbert,Ordulf,Magnus,Gottfried,Dietrich,Adalbert,Bernhard,Lothar,Albrecht',
    'Agnes,Gisela,Adelheid,Kunigunde,Mathilde,Richenza,Judith,Irmgard',
  ),
  norse: L(
    'Harald,Olaf,Magnus,Sweyn,Knut,Eric,Sigurd,Haakon,Stenkil,Halsten,Inge,Eystein,Thorkell,Ulf,Bjorn,Asbjorn,Ragnvald,Thorfinn',
    'Ingrid,Astrid,Gyda,Ragnhild,Thora,Sigrid,Estrid,Gunhild',
  ),
  finnic: L(
    'Kaleva,Vaino,Ilmari,Tapio,Kauko,Unto,Ahti,Kyosti,Almos,Arpad,Geza,Bela,Andras,Ladislaus,Koloman,Salomon',
    'Aino,Kyllikki,Marjatta,Sarolt,Adelheid,Sophia,Judit,Ilona',
  ),
  baltic: L(
    'Mindaugas,Traidenis,Vytenis,Treniota,Skirmantas,Dovsprungas,Zivinbudas,Gedvydas,Kukovaitis',
    'Morta,Birute,Aldona,Gaile,Rimgaile',
  ),
  west_slavic: L(
    'Boleslaw,Wladyslaw,Mieszko,Kazimierz,Vratislav,Spytihnev,Borivoj,Jaromir,Sobeslav,Zbigniew,Bretislav,Siemomysl,Swietopelk',
    'Dobrawa,Judyta,Swietoslawa,Ludmila,Richeza,Adelajda,Drahomira',
  ),
  south_slavic: L(
    'Petar,Mihailo,Stefan,Kresimir,Zvonimir,Dmitar,Bodin,Radoslav,Vojislav,Gojslav,Samuel,Ivan,Gavril',
    'Jelena,Marija,Neda,Helena,Kosara,Miroslava',
  ),
  east_slavic: L(
    'Iziaslav,Sviatoslav,Vsevolod,Yaroslav,Vladimir,Rostislav,Vseslav,Mstislav,Gleb,Oleg,Boris,David,Igor,Yaropolk,Sviatopolk',
    'Olga,Anna,Anastasia,Elisaveta,Evpraksia,Predslava,Rogneda,Gytha',
  ),
  greek: L(
    'Constantine,Romanos,Michael,Nikephoros,Isaac,Alexios,John,Andronikos,Basil,Leo,Theodore,Manuel,Nikolaos,Stephanos,Bardas,Eudokimos',
    'Eudokia,Zoe,Theodora,Anna,Irene,Maria,Helena,Sophia',
  ),
  caucasian: L(
    'Bagrat,Giorgi,Davit,Gagik,Ashot,Smbat,Vasak,Kiurike,Liparit,Demetre,Gurgen,Tornike',
    'Mariam,Borena,Tamar,Rusudan,Katranide,Gurandukht',
  ),
  arabic: L(
    'Muhammad,Ahmad,Ali,Hasan,Husayn,Abdallah,Yusuf,Ibrahim,Umar,Uthman,Jafar,Mansur,Nasr,Tamim,Badr,Qasim,Hamid,Khalid,Salih,Mahmud',
    'Fatima,Aisha,Khadija,Zaynab,Maryam,Sitt al-Mulk,Rabia,Sukayna,Asma,Ruqayya',
  ),
  berber: L(
    'Yusuf,Abu Bakr,Tamim,Ziri,Buluggin,Hammad,Yahya,Tashfin,Idris,Masud,Yintan,Tamsit',
    'Zaynab,Fatima,Tamima,Hawwa,Kella,Tinhinan',
  ),
  iranian: L(
    'Rustam,Bahram,Farhad,Kaykaus,Mardawij,Qabus,Manuchihr,Shahriyar,Ardashir,Hurmuz,Mazyar,Firuz,Khusraw,Dara,Sohrab',
    'Shirin,Roshanak,Parisa,Gordiya,Farangis,Azarmidokht,Mahbanu',
  ),
  turkic: L(
    'Arslan,Tughril,Chaghri,Qutalmish,Sulayman,Qavurt,Kilij,Tutush,Sanjar,Yinal,Tekish,Toghan,Bori,Qaraja,Altuntash,Satuq',
    'Terken,Aytekin,Altun,Qutlugh,Seljuka,Gevher',
  ),
  mongolic: L(
    'Yesugei,Qabul,Ambaghai,Qutula,Bartan,Toghrul,Menggei,Yelu Hongji,Yelu Yixin,Yelu Chun,Yelu Dashi,Xiao Xiaomu',
    'Hoelun,Borte,Alan Qo,Xiao Guanyin,Xiao Taman,Sorghaghtani',
  ),
  sinitic: L(
    'Zhao Xu,Zhao Shu,Wang Anshi,Sima Guang,Fan Zhongyan,Ouyang Xiu,Su Shi,Han Qi,Fu Bi,Di Qing,Bao Zheng,Zhang Zai,Cao Bin,Yang Ye,Wen Yanbo,Lu Gongzhu',
    'Li Qingzhao,Zhu Shuzhen,Cao Shi,Gao Taotao,Liu E,Meng Shi',
  ),
  japanese: L(
    'Minamoto no Yoshiie,Taira no Masamori,Fujiwara no Yorimichi,Fujiwara no Morozane,Minamoto no Yoriyoshi,Oe no Masafusa,Abe no Sadato,Kiyohara no Takenori',
    'Fujiwara no Kanshi,Taira no Tokiko,Sugawara no Takasue no Musume,Akiko,Teishi',
  ),
  korean: L(
    'Wang Hwi,Wang Hun,Wang Un,Yun Gwan,Choe Chung,Gang Gam-chan,Kim Bu-sik,Yi Ja-yeon,So Hui',
    'Queen Inye,Queen Inju,Lady Yi,Lady Kim',
  ),
  indian: L(
    'Bhoja,Jayasimha,Karna,Bhima,Someshvara,Vikramaditya,Kirtivarman,Lakshmikarna,Anangapala,Vigraharaja,Madanapala,Govindachandra,Chandradeva,Mahipala,Vijayasena',
    'Mayanalladevi,Rajyashri,Padmavati,Devaladevi,Kumaradevi,Rudradevi',
  ),
  dravidian: L(
    'Rajendra,Rajadhiraja,Virarajendra,Kulottunga,Vikrama,Rajaraja,Anantavarman,Vishnuvardhana,Kulasekhara',
    'Kundavai,Madhurantaki,Lokamahadevi,Ammangadevi,Tribhuvanamahadevi',
  ),
  himalayan: L(
    'Anawrahta,Sawlu,Kyansittha,Yeshe-O,Tsenpo,Drogon,Konchok,Marpa,Tsongkha,Byangchub',
    'Manisanda,Thambula,Khin U,Dronma,Yudron',
  ),
  southeast_asian: L(
    'Ly Thanh Tong,Ly Nhan Tong,Ly Thuong Kiet,Udayadityavarman,Harshavarman,Jayavarman,Suryavarman,Rudravarman,Harivarman,Mangrai',
    'Y Lan,Thuong Duong,Indradevi,Jayarajadevi',
  ),
  austronesian: L(
    'Airlangga,Mapanji Garasakan,Anak Wungsu,Sangrama,Datu Puti,Lumabat,Tuanku,Andriamanelo,Ralambo,Tangaloa,Ahoeitu,Malietoa,Rata',
    'Dharmawangsa,Sri Isana,Ratu Maharani,Rafohy,Rangita,Hina,Salamasina',
  ),
  african: L(
    'Tunka Manin,Kanissa,Dia Kossoi,Hummay,Dunama,Kabine,Kankan,Sumanguru,Sonni,Moussa,Oranmiyan,Oduduwa,Mutapa,Nyatsimba',
    'Kasa,Niani,Sogolon,Moremi,Amina,Nandi',
  ),
  east_african: L(
    'Yemrehana Krestos,Tatadim,Georgios,Salomon,Basileios,Merkurios,Zacharias,Raphael,Solomon,Mahfuz',
    'Maryam,Masarra,Eudokia,Martha,Tigist',
  ),
  american: L(
    'Eight Deer,Four Jaguar,Kakupacal,Itzamna Balam,Mayta,Manco,Sinchi,Tecum,Acamapichtli,Tenoch,Topiltzin,Ihuitimal,Kalfukura,Opechan,Tadodaho,Hiawatha',
    'Six Monkey,Ixchel,Mama Ocllo,Chimalma,Tlazolli,Jigonsaseh,Wenonah',
  ),
  arctic: L('Nanook,Ataneq,Kiviuq,Tulugaq,Anguta,Akna,Taqqiq,Qanik', 'Sedna,Nuliajuk,Aputi,Pana,Uki'),
};

const GROUP_FAMILY: Record<string, string> = {
  frankish: 'frankish',
  celtic: 'celtic',
  iberian: 'iberian',
  arabic: 'arabic',
  latin: 'italian',
  germanic: 'german',
  norse: 'norse',
  finno_ugric: 'finnic',
  baltic: 'baltic',
  west_slavic: 'west_slavic',
  south_slavic: 'south_slavic',
  east_slavic: 'east_slavic',
  byzantine: 'greek',
  caucasian: 'caucasian',
  iranian: 'iranian',
  turkic: 'turkic',
  berber: 'berber',
  east_african: 'east_african',
  bantu: 'african',
  west_african: 'african',
  khoisan: 'african',
  austronesian: 'austronesian',
  indo_aryan: 'indian',
  himalayan: 'himalayan',
  munda: 'indian',
  dravidian: 'dravidian',
  sinitic: 'sinitic',
  mongolic: 'mongolic',
  tungusic: 'mongolic',
  korean: 'korean',
  japonic: 'japanese',
  austroasiatic: 'southeast_asian',
  tai: 'southeast_asian',
  papuan: 'austronesian',
  australian: 'austronesian',
  siberian: 'arctic',
  eskimo: 'arctic',
};

/** Culture ids that use a different family from the rest of their group. */
const CULTURE_FAMILY: Record<string, string> = {
  english: 'english',
  hungarian: 'finnic',
  ainu: 'arctic',
};

export function nameList(culture: string, group: string | undefined): NameList {
  const family = CULTURE_FAMILY[culture] ?? (group ? GROUP_FAMILY[group] : undefined) ?? 'american';
  return FAMILIES[family] ?? FAMILIES.american;
}
