| Scenario | Function | jsdiff | rapid-diff (native) | Speedup |
|---|---|---|---|---|
| Large file, small edit (360 KB, ~2% of lines) | `diffLines` | 16 ms | **5.44 ms** | **2.9×** |
| Large file, small edit (360 KB, ~2% of lines) | `createTwoFilesPatch` | 16 ms | **6.33 ms** | **2.6×** |
| Typical source file (20 KB, a few edits) | `diffLines` | 0.98 ms | **0.29 ms** | **3.4×** |
| Typical source file (20 KB, a few edits) | `createTwoFilesPatch` | 1.04 ms | **0.36 ms** | **2.9×** |
| 1,000 small diffs (2 KB each) | `diffLines` | 13 ms | **13 ms** | **1.1×** |
| 1,000 small diffs (2 KB each) | `createTwoFilesPatch` | 23 ms | **22 ms** | **1.0×** |
| Completely different files (2,000 lines each) | `diffLines` | 415 ms | **93 ms** | **4.5×** |
| Completely different files (2,000 lines each) | `createTwoFilesPatch` | 417 ms | **93 ms** | **4.5×** |

Node v24.18.0, Apple M1 Max
