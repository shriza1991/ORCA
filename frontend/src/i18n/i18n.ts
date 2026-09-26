import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
import te from './locales/te.json';

import hiPlaces from './locales/hi/place_names.json';
import mrPlaces from './locales/mr/place_names.json';
import taPlaces from './locales/ta/place_names.json';
import tePlaces from './locales/te/place_names.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi, place_names: hiPlaces },
      mr: { translation: mr, place_names: mrPlaces },
      ta: { translation: ta, place_names: taPlaces },
      te: { translation: te, place_names: tePlaces }
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
