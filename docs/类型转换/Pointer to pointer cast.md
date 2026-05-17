# Pointer to pointer cast

​`*const T`​ / `*mut T`​ can be cast to `*const U`​ / `*mut U` with the following behavior:

- If `T`​ and `U` are both sized, the pointer is returned unchanged.
- If `T`​ is unsized and `U`​ is sized, the cast discards all metadata that completes the wide pointer `T`​ and produces a thin pointer `U` consisting of the data part of the unsized pointer.
- If `T`​ and `U`​ are both unsized, the pointer is also returned unchanged. In particular, the metadata is preserved exactly.  
  For instance, a cast from `*const [T]`​ to `*const [U]`​ preserves the number of elements. Note that, as a consequence, such casts do not necessarily preserve the size of the pointer’s referent (e.g., casting `*const [u16]`​ to `*const [u8]`​ will result in a raw pointer which refers to an object of half the size of the original). The same holds for `str`​ and any compound type whose unsized tail is a slice type, such as `struct Foo(i32, [u8])`​ or `(u64, Foo)`.

注意当 `T`​ 和 `U` 均为 unsized 时，转换的前提条件是:

- Both slice metadata (`*[u16] -> *[u8]`​, `*str -> *(u8, [u32])`), or
- Both the same trait object metadata, modulo dropping auto traits (`*dyn Debug -> *(u16, dyn Debug`).

‍
