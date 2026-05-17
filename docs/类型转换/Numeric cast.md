# Numeric cast

- Casting between two integers of the same size (e.g. i32 -\> u32) is a no-op (Rust uses 2’s complement for negative values of fixed integers)

  ```rust
  assert_eq!(42i8 as u8, 42u8);
  assert_eq!(-1i8 as u8, 255u8);
  assert_eq!(255u8 as i8, -1i8);
  assert_eq!(-1i16 as u16, 65535u16);
  ```
- Casting from a larger integer to a smaller integer (e.g. u32 -\> u8) will truncate (**through**  **​`%`​** ​ **operation**)

  ```rust
  assert_eq!(42u16 as u8, 42u8);
  assert_eq!(1234u16 as u8, 210u8);
  assert_eq!(0xabcdu16 as u8, 0xcdu8);

  assert_eq!(-42i16 as i8, -42i8);
  assert_eq!(1234u16 as i8, -46i8);
  assert_eq!(0xabcdi32 as i8, -51i8);
  ```
- Casting from a smaller integer to a larger integer (e.g. u8 -\> u32) will

  - zero-extend if the source is unsigned
  - sign-extend if the source is signed

  ```rust
  assert_eq!(42i8 as i16, 42i16);
  assert_eq!(-17i8 as i16, -17i16);
  assert_eq!(0b1000_1010u8 as u16, 0b0000_0000_1000_1010u16, "Zero-extend");
  assert_eq!(0b0000_1010i8 as i16, 0b0000_0000_0000_1010i16, "Sign-extend 0");
  assert_eq!(0b1000_1010u8 as i8 as i16, 0b1111_1111_1000_1010u16 as i16, "Sign-extend 1");

  ```
- Casting from a float to an integer will round the float towards zero

  - ​`NaN`​ will return `0`
  - Values larger than the maximum integer value, including `INFINITY`, will saturate to the maximum value of the integer type.
  - Values smaller than the minimum integer value, including `NEG_INFINITY`, will saturate to the minimum value of the integer type.

  ```rust
  assert_eq!(42.9f32 as i32, 42);
  assert_eq!(-42.9f32 as i32, -42);
  assert_eq!(42_000_000f32 as i32, 42_000_000);
  assert_eq!(std::f32::NAN as i32, 0);
  assert_eq!(1_000_000_000_000_000f32 as i32, 0x7fffffffi32);
  assert_eq!(std::f32::NEG_INFINITY as i32, -0x80000000i32);
  ```
- Casting from an integer to float will produce the closest possible float

  - if necessary, rounding is according to `roundTiesToEven`​ mode ( `roundTiesToEven`​ 即 round 到最近的偶数，采取这种方式是因为**当** **​`ULP > 1`​**​ **时 (即** **​`ULP >= 2`​**​ **时) 浮点数当然一定是个偶数，而当** **​`ULP<=1`​**​ **时浮点数一定能精确表示整数**)
  - on overflow, infinity (of the same sign as the input) is produced
  - note: with the current set of numeric types, overflow can only happen on `u128 as f32`​ for values greater or equal to `f32::MAX + (0.5 ULP)` (ULP: Unit in the Last Place，最小精度单位)

  ```rust
  assert_eq!(1337i32 as f32, 1337f32);
  assert_eq!(123_456_789i32 as f32, 123_456_790f32, "Rounded");
  assert_eq!(0xffffffff_ffffffff_ffffffff_ffffffff_u128 as f32, std::f32::INFINITY);
  ```
- Casting from an f32 to an f64 is perfect and lossless

  ```rust
  assert_eq!(1_234.5f32 as f64, 1_234.5f64);
  assert_eq!(std::f32::INFINITY as f64, std::f64::INFINITY);
  assert!((std::f32::NAN as f64).is_nan());
  ```
- Casting from an f64 to an f32 will produce the closest possible f32

  - if necessary, rounding is according to `roundTiesToEven` mode
  - on overflow, infinity (of the same sign as the input) is produced

  ```rust
  assert_eq!(1_234.5f64 as f32, 1_234.5f32);
  assert_eq!(1_234_567_891.123f64 as f32, 1_234_567_890f32, "Rounded");
  assert_eq!(std::f64::INFINITY as f32, std::f32::INFINITY);
  assert!((std::f64::NAN as f32).is_nan());
  ```

Notes:

1. If integer-to-float casts with this rounding mode and overflow behavior are not supported natively by the hardware, these casts will likely be slower than expected.
2. If f64-to-f32 casts with this rounding mode and overflow behavior are not supported natively by the hardware, these casts will likely be slower than expected.
3. As defined in IEEE 754-2008 §4.3.1: pick the nearest floating point number, preferring the one with an even least significant digit if exactly halfway between two floating point numbers.

‍
