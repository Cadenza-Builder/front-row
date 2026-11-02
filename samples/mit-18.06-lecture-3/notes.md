# Matrix Multiplication: Three Ways to See AB

Matrix multiplication $C=AB$ by the row-times-column entry sum, then reinterpreted as A acting on the columns of B and as rows of A acting on B.

## The standard rule: row times column and compatible shapes

Let the product be $C = AB$. The entry in row $I$ and column $J$ is written $C_{IJ}$ — row number first, then column number.

For example, $C_{34}$ comes from row 3 of $A$ and column 4 of $B$:

$C_{34} = (\text{row 3 of } A) \cdot (\text{column 4 of } B)$

In entries this is $a_{31}b_{14} + a_{32}b_{24} + \cdots$, continuing across the whole row and down the whole column:

$C_{34} = \sum_{k=1}^{N} a_{3k}b_{k4}$

where $a_{3k}$ is in row 3, column $k$ of $A$ and $b_{k4}$ is in row $k$, column 4 of $B$. This is index practice; most of the course works with whole vectors rather than individual entries.

Shapes: think of $A$ as $M \times N$ — $M$ rows, $N$ columns. For the sum to make sense, the length across must match the length down, so $B$ must have $N$ rows. If $B$ is $N \times P$, the result $C$ is $M \times P$. If the matrices are square they must be the same size; if rectangular, the number of columns of $A$ must equal the number of rows of $B$. Every entry of $C$ looks like the sum above. This standard rule is the first of four ways to see the same calculation.

$$C_{34} = \sum_{k=1}^{N} a_{3k} b_{k4}$$

- $C_{34}$: entry in row 3, column 4 of the product C
- $a_{3k}$: entry in row 3, column k of A
- $b_{k4}$: entry in row k, column 4 of B
- $N$: number of columns of A, equal to number of rows of B
- $k$: index running along the row of A and down the column of B

$$A_{M \times N} B_{N \times P} = C_{M \times P}$$

- $A_{M \times N}$: left matrix with M rows and N columns
- $B_{N \times P}$: right matrix with N rows and P columns
- $C_{M \times P}$: product with M rows and P columns

## Second way: columns — A times each column of B

Do $AB = C$ again, with $A$ $M \times N$, $B$ $N \times P$, $C$ $M \times P$, but now look at whole columns.

How to multiply a matrix by a column is already known. $A$ times the first column of $B$ is the first column of the answer; $A$ times the second column is the second column of the answer. Think of the $P$ columns of $B$ sitting side by side and multiply $A$ times each one to get the $P$ columns of $C$.

This tells us what the columns of $C$ are: they are combinations of the columns of $A$. That is because $A$ times any vector is a combination of the columns of $A$. It fits in size because the columns of $A$ have length $M$ and the columns of $C$ have length $M$. The numbers in a column of $B$ tell what combination to take.

$$A B_{:,j} = C_{:,j}$$

- $A$: M by N left matrix
- $B_{:,j}$: j-th column of B
- $C_{:,j}$: j-th column of the product C

## Third way: rows — each row of A times B

The third way is to look by rows. A row of $A$ multiplies all of $B$ and produces the corresponding row of the product.

That row of $C$ is a combination of the rows of $B$, with coefficients coming from that row of $A$. [inaudible]

$$A_{i,:} B = C_{i,:}$$

- $A_{i,:}$: i-th row of A
- $B$: right matrix B
- $C_{i,:}$: i-th row of the product C

## Terms

- **matrix multiplication**: product C = AB where the (i,j) entry is row i of A dotted with column j of B; requires columns of A = rows of B
- **row times column**: entry rule C_{ij} = sum_k a_{ik} b_{kj}
- **dot product**: sum of pairwise products of two vectors of the same length
- **linear combination**: sum of scalar multiples of vectors, where the scalars give the combination

## Putting it together

The entry sum, the column picture, and the row picture are the same calculation: the entry formula adds up products along a row and down a column, collecting those results column-by-column shows each column of C as a combination of columns of A, and collecting row-by-row shows each row of C as a combination of rows of B.

