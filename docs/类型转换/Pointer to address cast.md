# Pointer to address cast

Casting from a raw pointer to an integer produces the machine address of the referenced memory. If the integer type is smaller than the pointer type, the address may be truncated; using `usize` avoids this.

如果 `*T where T: ?Sized`​ 则需要先将其强制转换为 `*U where U: Sized`

‍
