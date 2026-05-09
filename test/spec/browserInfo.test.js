import { getSystemInfo } from '../../src/browserInfo';

describe('getSystemInfo', () => {
  let systemInfo;

  beforeAll(() => {
    // getSystemInfo relies on global mocks set in jest.setup.js
    // We can call it once if the global mocks are static for these tests
    systemInfo = getSystemInfo();
  });

  it('should return an object', () => {
    expect(typeof systemInfo).toBe('object');
    expect(systemInfo).not.toBeNull();
  });

  it('should contain all expected keys', () => {
    expect(systemInfo).toHaveProperty('browser');
    expect(systemInfo).toHaveProperty('browserVersion');
    expect(systemInfo).toHaveProperty('browserDisplayName');
    expect(systemInfo).toHaveProperty('os');
    expect(systemInfo).toHaveProperty('architecture');
    expect(systemInfo).toHaveProperty('osDisplay');
    expect(systemInfo).toHaveProperty('osVersion');
    expect(systemInfo).toHaveProperty('platform');
    expect(systemInfo).toHaveProperty('userAgent');
    expect(systemInfo).toHaveProperty('language');
    expect(systemInfo).toHaveProperty('languages');
    expect(systemInfo).toHaveProperty('timezone');
    expect(systemInfo).toHaveProperty('cookies');
    expect(systemInfo).toHaveProperty('flashVersion');
  });

  it('should detect browser name correctly from userAgent', () => {
    expect(systemInfo.browser).toBe('Chrome');
  });

  it('should detect browser version from userAgent', () => {
    expect(systemInfo.browserVersion).toBe('136.0.7103.93');
    expect(systemInfo.browserDisplayName).toBe('Chrome 136.0.7103.93');
  });

  it('should detect operating system and architecture', () => {
    expect(systemInfo.os).toBe('Linux');
    expect(systemInfo.architecture).toBe('x86_64');
    expect(systemInfo.osDisplay).toBe('Linux x86_64');
  });

  it('should preserve raw platform and userAgent details', () => {
    expect(systemInfo.platform).toBe('Linux x86_64');
    expect(systemInfo.userAgent).toContain('Chrome/136.0.7103.93');
    expect(systemInfo.osVersion).toContain('Chrome/136.0.7103.93');
  });

  it('should retrieve locale and cookie support', () => {
    expect(systemInfo.language).toBe('ru-RU');
    expect(systemInfo.languages).toEqual(['ru-RU', 'en-US']);
    expect(systemInfo.cookies).toBe(true);
  });

  it('should report timezone and Flash version', () => {
    expect(typeof systemInfo.timezone).toBe('string');
    expect(systemInfo.flashVersion).toBe('N/A');
  });
});
