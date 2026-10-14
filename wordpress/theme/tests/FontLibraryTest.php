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
	/** A real family and variable range produce one safe stack. */
	public function test_parse_and_stack(): void {
		$family = FontLibrary::parse_family( '{"slug":"inter","name":"Inter","fontFamily":"Inter","fontFace":[{"fontWeight":"100 900","fontStyle":"normal"},{"fontWeight":"700","fontStyle":"italic"}]}' );
		if ( null === $family ) {
			$this->fail( 'Valid family did not parse.' );
		}
		$this->assertSame( 'inter', $family['slug'] );
		$this->assertSame(
			array(
				array(
					'weight' => '100 900',
					'style'  => 'normal',
				),
				array(
					'weight' => '700',
					'style'  => 'italic',
				),
			),
			$family['faces']
		);
		$this->assertSame( '"Inter", system-ui, sans-serif', FontLibrary::css_stack( $family['css_family'], 'sans-serif' ) );
	}

	/** CSS-breaking strings, invalid variants and large posts are rejected. */
	public function test_reject_hostile_data(): void {
		foreach ( array( 'Bad"Name', 'Bad;Name', 'Bad{Name', 'url(x)', \str_repeat( 'A', 65 ) ) as $name ) {
			$this->assertNull(
				FontLibrary::parse_family(
					self::json(
						array(
							'slug'       => 'bad',
							'name'       => 'Bad',
							'fontFamily' => $name,
							'fontFace'   => array(),
						)
					)
				)
			);
			$this->assertNull( FontLibrary::css_stack( $name, 'sans-serif' ) );
		}
		$this->assertNull( FontLibrary::css_stack( 'Inter', 'url(x)' ) );
		foreach ( array( '99', '950', '900 100', '400;url(x)' ) as $weight ) {
			$this->assertNull(
				FontLibrary::parse_family(
					self::json(
						array(
							'slug'       => 'bad',
							'name'       => 'Bad',
							'fontFamily' => 'Bad',
							'fontFace'   => array( array( 'fontWeight' => $weight ) ),
						)
					)
				)
			);
		}
		$this->assertNull(
			FontLibrary::parse_family(
				self::json(
					array(
						'slug'       => 'bad',
						'name'       => 'Bad',
						'fontFamily' => 'Bad',
						'fontFace'   => array( array( 'fontStyle' => 'italic;}' ) ),
					)
				)
			)
		);
		$this->assertNull(
			FontLibrary::parse_family(
				self::json(
					array(
						'slug'       => '../bad',
						'name'       => 'Bad',
						'fontFamily' => 'Bad',
						'fontFace'   => array(),
					)
				)
			)
		);
		$this->assertNull( FontLibrary::parse_family( \str_repeat( 'x', 16385 ) ) );
	}

	/** Duplicate slugs and families beyond the cap are ignored. */
	public function test_dedupe_and_cap(): void {
		$posts = array();
		for ( $i = 0; $i < 60; $i++ ) {
			$posts[] = self::json(
				array(
					'slug'       => 'font-' . $i,
					'name'       => 'Font ' . $i,
					'fontFamily' => 'Font ' . $i,
					'fontFace'   => array(),
				)
			);
		}
		$posts[] = $posts[0];
		$this->assertCount( FontLibrary::MAX_FAMILIES, FontLibrary::parse_families( $posts ) );
		$this->assertCount( 1, FontLibrary::parse_families( array( $posts[0], $posts[0] ) ) );
	}

	/** Only injected server-derived stacks pass the pure token validator. */
	public function test_token_allowlist(): void {
		$seed                       = self::seed();
		$seed['font-body']['value'] = '"Inter", system-ui, sans-serif';
		$this->assertArrayHasKey( 'font-body-value', TokenDraft::validate( $seed, self::seed() ) );
		$this->assertSame( array(), TokenDraft::validate( $seed, self::seed(), array( '"Inter", system-ui, sans-serif' ) ) );
		$seed['font-body']['value'] = 'Evil; background:url(x)';
		$this->assertArrayHasKey( 'font-body-value', TokenDraft::validate( $seed, self::seed(), array( '"Inter", system-ui, sans-serif' ) ) );
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
