/**
 * AdMob unit IDs
 *
 * Abhi Google TEST IDs hain — production se pehle AdMob console se
 * apne real IDs set karo (EXTRA_ADMOB_* env ya yahan replace).
 *
 * Test App ID Android: ca-app-pub-3940256099942544~3347511713
 */
import { Platform } from 'react-native';

const IS_ANDROID = Platform.OS === 'android';

/** Set true only while testing with Google sample ads */
export const ADMOB_USE_TEST_IDS = true;

const TEST = {
  appIdAndroid: 'ca-app-pub-3940256099942544~3347511713',
  appIdIos: 'ca-app-pub-3940256099942544~1458002511',
  banner: 'ca-app-pub-3940256099942544/6300978111',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  appOpen: 'ca-app-pub-3940256099942544/9257395921',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

/** Production placeholders — replace with your AdMob IDs */
const PROD = {
  appIdAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
  appIdIos: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
  banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/BBBBBBBBBB',
  rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/RRRRRRRRRR',
  appOpen: 'ca-app-pub-XXXXXXXXXXXXXXXX/OOOOOOOOOO',
  interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/IIIIIIIIII',
};

const IDS = ADMOB_USE_TEST_IDS ? TEST : PROD;

export const ADMOB_APP_ID = IS_ANDROID ? IDS.appIdAndroid : IDS.appIdIos;
export const AD_UNIT_BANNER = IDS.banner;
export const AD_UNIT_REWARDED = IDS.rewarded;
export const AD_UNIT_APP_OPEN = IDS.appOpen;
export const AD_UNIT_INTERSTITIAL = IDS.interstitial;

/** 5 completed rewarded videos = 1 day premium */
export const REWARDED_ADS_FOR_ONE_DAY = 5;
export const REWARD_PREMIUM_DAYS = 1;
