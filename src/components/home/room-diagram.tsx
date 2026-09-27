/** A schematic, not a product listing. Inline SVG keeps the first view independent
 * of image downloads, web fonts, and the interactive 3D viewer. */
export function RoomDiagram() {
  return (
    <svg
      viewBox="0 0 560 400"
      width="560"
      height="400"
      className="h-auto w-full"
      role="img"
      aria-labelledby="room-diagram-title room-diagram-description"
    >
      <title id="room-diagram-title">ぬいぐるみを椅子に座らせたお部屋の構成図</title>
      <desc id="room-diagram-description">
        背景の壁、椅子、床になる台座を組み合わせた例。幅と奥行きは置き場所に合わせて選びます。
      </desc>
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        {/* Open-front room: two walls and a solid base. */}
        <path d="M90 257 280 153 480 261 290 365Z" fill="currentColor" fillOpacity=".14" stroke="none" />
        <path d="M85 238V94L272 24V164Z" fill="currentColor" fillOpacity=".06" />
        <path d="M272 24 474 123V267L272 164Z" fill="currentColor" fillOpacity=".12" />
        <path d="M85 238 272 164 474 267 287 341Z" fill="currentColor" fillOpacity=".2" />
        <path d="M85 238V251L287 354V341Z" fill="currentColor" fillOpacity=".1" />
        <path d="M287 341 474 267V280L287 354Z" fill="currentColor" fillOpacity=".08" />

        {/* Window on the left wall. */}
        <path d="M126 103 226 65V153L126 192Z" fill="none" />
        <path d="M176 84V173M126 147 226 109" fill="none" />
        <path d="M121 194 229 152 237 158 129 200Z" fill="currentColor" fillOpacity=".22" />

        {/* Shelf and a small planter on the back wall. */}
        <path d="M354 136 423 170 436 165 367 131Z" fill="currentColor" fillOpacity=".3" />
        <path d="M354 136V143L423 177V170M423 177 436 172V165" fill="none" />
        <path d="M383 126 401 135 399 151 385 144Z" fill="currentColor" fillOpacity=".4" />
        <path d="M392 134V108M392 120Q373 110 378 100Q392 105 392 120M392 115Q409 116 409 104Q395 103 392 115" fill="none" />

        {/* Chair legs, back and seat. */}
        <path d="M206 249V278L217 284V255M286 288V316L297 311V283M337 256V282L347 277V252" fill="currentColor" fillOpacity=".25" />
        <path d="M205 245V151Q205 141 214 145L308 191V278Z" fill="currentColor" fillOpacity=".2" />
        <path d="M205 245 261 221 347 264 290 289Z" fill="currentColor" fillOpacity=".45" />
        <path d="M205 245V254L290 298V289M290 298 347 273V264" fill="none" />

        {/* A generic plush silhouette, unrelated to any character. */}
        <path d="M241 199C219 186 220 161 233 148C223 133 238 122 249 135C260 132 273 135 283 143C297 138 307 154 297 164C306 187 296 206 277 208L280 217C294 223 302 240 298 253C312 254 318 266 309 272C300 278 285 270 278 264C267 262 256 257 247 250C237 255 222 251 220 242C218 233 228 229 236 231C230 219 233 208 241 199Z" fill="currentColor" stroke="none" />
        <g fill="var(--brand)" stroke="none">
          <ellipse cx="249" cy="170" rx="2.5" ry="3.5" />
          <ellipse cx="277" cy="182" rx="2.5" ry="3.5" />
        </g>
        <path d="m258 185 7 4M253 215 271 224 271 234 253 225Z" fill="none" stroke="var(--brand)" strokeWidth="2" />

        {/* No invented product measurements. */}
        <g fill="none" strokeWidth="1.5">
          <path d="M74 270 255 362M68 275 80 265M249 367 261 357M318 366 484 302M315 360 321 372M481 296 487 308" />
        </g>
      </g>
      <g fill="currentColor" className="text-4xl sm:text-2xl" textAnchor="middle">
        <text x="143" y="335">幅</text>
        <text x="422" y="355">奥行き</text>
      </g>
    </svg>
  );
}
