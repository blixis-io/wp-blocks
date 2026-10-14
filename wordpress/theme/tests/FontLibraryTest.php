<?php
/**
 * Font Library parsing and CSS value tests.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\FontLibrary;
use Blixis\Theme\TokenDraft;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test stand-in.
}
require_once \dirname( __DIR__ ) . '/src/FontLibrary.php';
require_once \dirname( __DIR__ ) . '/src/TokenDraft.php';

/** Pure parsing and validation. */
final class FontLibraryTest extends TestCase {
	/** The shape WordPress stores (slug in post_name, stack in content, faces as child posts) is understood. */
	public function test_wordpress_post_shape(): void {
		$json = FontLibrary::from_post_data(
			'montserrat',
			'Montserrat',
			'{"fontFamily":"Montserrat, sans-serif","preview":"https://s.w.org/x.svg"}',
			[
				'{"src":"https://example.test/a.woff2","fontWeight":"400","fontStyle":"normal","fontFamily":"Montserrat"}',
				'{"fontWeight":"700","fontStyle":"italic","fontFamily":"Montserrat"}',
				'not json',
			]
		);
		$this->assertNotNull( $json );
		$family = FontLibrary::parse_family( (string) $json );
		$this->assertNotNull( $family );
		$this->assertSame( 'montserrat', $family['slug'] );
		$this->assertSame( 'Montserrat', $family['css_family'] );
		$this->assertCount( 2, $family['faces'] );
		$this->assertNull( FontLibrary::from_post_data( 'x', 'X', 'not json', [] ) );
		$this->assertSame( 'Open Sans', FontLibrary::parse_family( (string) FontLibrary::from_post_data( 'open-sans', 'Open Sans', '{"fontFamily":"\'Open Sans\', sans-serif"}', [] ) )['css_family'] ?? null );
	}

	/** A real family and variable range produce one safe stack. */
	public function test_parse_and_stack(): void {
		$family = FontLibrary::parse_family( '{"slug":"inter","name":"Inter","fontFamily":"Inter","fontFace":[{"fontWeight":"100 900","fontStyle":"normal"},{"fontWeight":"700","fontStyle":"italic"}]}' );
		if ( null === $family ) {
			$this->fail( 'Valid family did not parse.' );
		}
		$this->assertSame( 'inter', $family['slug'] );
		$this->assertSame(
			[
				[
					'weight' => '100 900',
					'style'  => 'normal',
				],
				[
					'weight' => '700',
					'style'  => 'italic',
				],
			],
			$family['faces']
		);
		$this->assertSame( '"Inter", system-ui, sans-serif', FontLibrary::css_stack( $family['css_family'], 'sans-serif' ) );
	}

	/** CSS-breaking strings, invalid variants and large posts are rejected. */
	public function test_reject_hostile_data(): void {
		foreach ( [ 'Bad"Name', 'Bad;Name', 'Bad{Name', 'url(x)', \str_repeat( 'A', 65 ) ] as $name ) {
			$this->assertNull(
				FontLibrary::parse_family(
					self::json(
						[
							'slug'       => 'bad',
							'name'       => 'Bad',
							'fontFamily' => $name,
							'fontFace'   => [],
						]
					)
				)
			);
			$this->assertNull( FontLibrary::css_stack( $name, 'sans-serif' ) );
		}
		$this->assertNull( FontLibrary::css_stack( 'Inter', 'url(x)' ) );
		foreach ( [ '99', '950', '900 100', '400;url(x)' ] as $weight ) {
			$this->assertNull(
				FontLibrary::parse_family(
					self::json(
						[
							'slug'       => 'bad',
							'name'       => 'Bad',
							'fontFamily' => 'Bad',
							'fontFace'   => [ [ 'fontWeight' => $weight ] ],
						]
					)
				)
			);
		}
		$this->assertNull(
			FontLibrary::parse_family(
				self::json(
					[
						'slug'       => 'bad',
						'name'       => 'Bad',
						'fontFamily' => 'Bad',
						'fontFace'   => [ [ 'fontStyle' => 'italic;}' ] ],
					]
				)
			)
		);
		$this->assertNull(
			FontLibrary::parse_family(
				self::json(
					[
						'slug'       => '../bad',
						'name'       => 'Bad',
						'fontFamily' => 'Bad',
						'fontFace'   => [],
					]
				)
			)
		);
		$this->assertNull( FontLibrary::parse_family( \str_repeat( 'x', 16385 ) ) );
	}

	/** Duplicate slugs and families beyond the cap are ignored. */
	public function test_dedupe_and_cap(): void {
		$posts = [];
		for ( $i = 0; $i < 60; $i++ ) {
			$posts[] = self::json(
				[
					'slug'       => 'font-' . $i,
					'name'       => 'Font ' . $i,
					'fontFamily' => 'Font ' . $i,
					'fontFace'   => [],
				]
			);
		}
		$posts[] = $posts[0];
		$this->assertCount( FontLibrary::MAX_FAMILIES, FontLibrary::parse_families( $posts ) );
		$this->assertCount( 1, FontLibrary::parse_families( [ $posts[0], $posts[0] ] ) );
	}

	/** Only injected server-derived stacks pass the pure token validator. */
	public function test_token_allowlist(): void {
		$seed                       = self::seed();
		$seed['font-body']['value'] = '"Inter", system-ui, sans-serif';
		$this->assertArrayHasKey( 'font-body-value', TokenDraft::validate( $seed, self::seed() ) );
		$this->assertSame( [], TokenDraft::validate( $seed, self::seed(), [ '"Inter", system-ui, sans-serif' ] ) );
		$seed['font-body']['value'] = 'Evil; background:url(x)';
		$this->assertArrayHasKey( 'font-body-value', TokenDraft::validate( $seed, self::seed(), [ '"Inter", system-ui, sans-serif' ] ) );
	}

	/**
	 * Encode a test family.
	 *
	 * @param array<string, mixed> $value Family data.
	 */
	private static function json( array $value ): string {
		return \json_encode( $value, JSON_THROW_ON_ERROR );
	}

	/**
	 * Load a valid bundled seed.
	 *
	 * @return array<string, mixed> Default tokens.
	 */
	private static function seed(): array {
		$seed = TokenDraft::seed( \dirname( __DIR__ ) . '/design/default-tokens.json', 'custom' );
		if ( null === $seed ) {
			self::fail( 'Default tokens unavailable.' );
		}
		return $seed;
	}
}
