window.ITS_REPAIR_CONTENT = {
  groups: {
    display: {
      ids: ['display-original', 'display-premium', 'display-standard'],
      label: 'Výměna displeje',
      image: 'images/devices/iphone-parts/iphone-displej.webp',
      description:
        'Výměna displeje je nutná, pokud se na displeji objeví fleky, čáry, praskliny, nebo pokud nefunguje správně. ' +
        'Vyberte si kvalitu dílu podle toho, jak moc vám záleží na věrnosti originálu.',
      showComparison: true
    }
  },

  items: {
    'display-original': {
      shortTitle: 'Originální kvalita',
      sidebarTitle: 'Výměna displeje — Originální kvalita',
      description:
        'Nejkvalitnější varianta s vlastnostmi shodnými s originálním dílem výrobce. ' +
        'Vhodná, pokud chcete maximální věrnost barev, dotyku i spotřeby.'
    },
    'display-premium': {
      shortTitle: 'Prémiová kvalita',
      sidebarTitle: 'Výměna displeje — Premium kvalita',
      description:
        'Vysoká kvalita blízká originálu. Barvy, dotyk i spotřeba jsou velmi podobné originálnímu dílu, ' +
        'za výhodnější cenu.'
    },
    'display-standard': {
      shortTitle: 'Standardní kvalita',
      sidebarTitle: 'Výměna displeje — Standard kvalita',
      description:
        'Výměna displeje je nutná, pokud se na displeji objeví fleky, čáry, praskliny, nebo pokud nefunguje správně. ' +
        'Standardní kvalita je cenově dostupná varianta s kvalitními materiály.'
    },
    'power-button': {
      sidebarTitle: 'Výměna tlačítka power',
      description: 'Oprava nebo výměna tlačítka zapnutí/vypnutí, pokud nereaguje, zasekává se nebo funguje nespolehlivě.',
      image: 'images/devices/iphone-parts/iphone-turn-on-off-button'
    },
    'volume-buttons': {
      sidebarTitle: 'Výměna tlačítek hlasitosti',
      description: 'Oprava tlačítek hlasitosti při zasekávání, nefunkčnosti nebo mechanickém poškození.',
      image: 'images/devices/iphone-parts/iphone-hlasitost-button-logo.png'
    },
    housing: {
      sidebarTitle: 'Výměna pouzdra',
      description: 'Výměna poškozeného rámu / pouzdra telefonu po pádu nebo ohybu.',
      image: 'images/devices/iphone-parts/iphone-displej.webp'
    },
    'back-glass': {
      sidebarTitle: 'Výměna zadního skla',
      description: 'Výměna prasklého nebo poškrábaného zadního skla. Telefon opět vypadá a drží se lépe.',
      image: 'images/devices/iphone-parts/iphone-zadni-sklo-logo.webp'
    },
    'speaker-bottom': {
      sidebarTitle: 'Oprava spodního reproduktoru',
      description: 'Oprava slabého, zkresleného nebo nefungujícího spodního reproduktoru.',
      image: 'images/devices/iphone-parts/iphone-spodni-reproduktor-logo.webp'
    },
    'speaker-top': {
      sidebarTitle: 'Oprava horního reproduktoru / sluchátka',
      description: 'Oprava horního reproduktoru (earpiece), pokud při hovoru neslyšíte druhé straně dobře.',
      image: 'images/devices/iphone-parts/iphone-horni-reproduktor-logo.png'
    },
    'mic-bottom': {
      sidebarTitle: 'Oprava spodního mikrofonu',
      description: 'Oprava mikrofonu, pokud vás druzí při hovoru nebo nahrávání špatně slyší.',
      image: 'images/devices/iphone-parts/iphone-spodni-mikrofon-logo.png'
    },
    battery: {
      sidebarTitle: 'Výměna baterie',
      description: 'Výměna slabé nebo nabobtnalé baterie. Vrátíme iPhonu celodenní výdrž.',
      image: 'images/devices/iphone-parts/iphone-baterie.webp'
    },
    'charging-port': {
      sidebarTitle: 'Oprava nabíjecího konektoru',
      description: 'Oprava nabíjecího portu při špatném kontaktu, přerušovaném nabíjení nebo nefunkčním konektoru.',
      image: 'images/devices/iphone-parts/iphone-nabijeci-konektor-logo.webp'
    },
    'camera-rear': {
      sidebarTitle: 'Oprava zadní kamery',
      description: 'Oprava zadní kamery při rozmazaném obrazu, černé obrazovce nebo nefunkčním focení.',
      image: 'images/devices/iphone-parts/iphone-zadni\u0301-kamera-logo.webp'
    },
    'camera-front': {
      sidebarTitle: 'Oprava přední kamery',
      description: 'Oprava přední kamery pro selfie a videohovory.',
      image: 'images/devices/iphone-parts/iphone-pr\u030cedni-kamera-logo.png'
    },
    'face-id': {
      sidebarTitle: 'Oprava Face ID',
      description: 'Diagnostika a oprava Face ID při nefunkčním odemykání obličejem.',
      image: 'images/devices/iphone-parts/iphone-faceid-logo.webp'
    }
  },

  comparison: {
    intro: {
      title: 'Detailní porovnání variant LCD displejů',
      text:
        'Porovnejte si displeje, které máme v nabídce rozdělené podle kvality. ' +
        'Pokud si nevíte rady, můžete se poradit na prodejně nebo nám zavolejte.',
      image: 'images/devices/iphone-parts/iphone-displej.webp'
    },
    tiers: [
      {
        id: 'display-original',
        title: 'Originální kvalita',
        score: 'Skóre 99,9 %',
        features: [
          { label: 'Barvy', text: 'Sytost, kontrast a vyvážení barev je shodné s originálním dílem.' },
          { label: 'Dotyk', text: 'Citlivost a responzivnost je shodná s originálním dílem.' },
          { label: 'Spotřeba', text: 'Displej má shodnou spotřebu baterie jako originální díl.' },
          { label: 'Materiál', text: 'Vyrobeno pouze z materiálu shodného s dílem výrobce.' },
          { label: 'Záruka', text: '12 měsíců na servisní úkon.' }
        ]
      },
      {
        id: 'display-premium',
        title: 'Prémiová kvalita',
        score: 'Skóre 95 %',
        features: [
          { label: 'Barvy', text: 'Sytost, kontrast a vyvážení barev je podobné s dílem originální kvality.' },
          { label: 'Dotyk', text: 'Citlivost a responzivnost je podobná s dílem originální kvality.' },
          { label: 'Spotřeba', text: 'Displej má podobnou spotřebu baterie jako originální díl výrobce.' },
          { label: 'Materiál', text: 'Vyrobeno z materiálů podobných s dílem výrobce.' },
          { label: 'Záruka', text: '12 měsíců na servisní úkon.' },
          {
            label: 'Dodatečné informace',
            text: 'V nastavení se může zobrazit hláška o neznámém dílu. Nemá vliv na funkčnost, jde pouze o informaci.'
          }
        ]
      },
      {
        id: 'display-standard',
        title: 'Standardní kvalita',
        score: 'Skóre 80 %',
        features: [
          { label: 'Barvy', text: 'Sytost, kontrast a vyvážení barev je lehce odlišné oproti originálnímu dílu.' },
          { label: 'Dotyk', text: 'Citlivost a responzivnost může být lehce odlišná oproti originálnímu dílu.' },
          { label: 'Spotřeba', text: 'Displej může mít vyšší spotřebu baterie ve srovnání s originálním dílem.' },
          { label: 'Materiál', text: 'Vyrobeno z kvalitních materiálů. Kvalita může být odlišná oproti originálu.' },
          { label: 'Záruka', text: '12 měsíců na servisní úkon.' },
          {
            label: 'Dodatečné informace',
            text: 'V nastavení se může zobrazit hláška o neznámém dílu. Nemá vliv na funkčnost, jde pouze o informaci.'
          }
        ]
      }
    ]
  }
};
