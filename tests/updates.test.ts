import {describe,it,expect} from 'vitest'
import {isNewerRelease} from '../src/main/updates'
describe('release comparison',()=>{
 it('compares numbers rather than strings',()=>{expect(isNewerRelease('1.9.0','v1.10.0')).toBe(true);expect(isNewerRelease('2.0.0','v1.10.0')).toBe(false)})
 it('ignores malformed or prerelease tags',()=>{expect(isNewerRelease('1.4.0','v1.4.0')).toBe(false);expect(isNewerRelease('1.4.0','v1.5.0-beta')).toBe(false);expect(isNewerRelease('1.4.0','garbage')).toBe(false)})
})
