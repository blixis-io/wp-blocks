<?php
/**
 * Tests for the compatibility declaration parser (BWB-029).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\Compat;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Stands in for WordPress so the guarded theme files load.
}
require_once dirname( __DIR__ ) . '/src/Compat.php';

/**
 * The header value rules.
 */
final class CompatTest extends TestCase {

	/**
	 * Valid header values.
	 *
	 * @return array<string, array{string|false|null, int|null}>
	 */
	public static function values(): array {
		return [
			'one'                => [ '1', 1 ],
			'two digits'         => [ '12', 12 ],
			'the maximum'        => [ '9999', 9999 ],
			'surrounding spaces' => [ "  3\t", 3 ],
			'missing header'     => [ false, null ],
			'null'               => [ null, null ],
			'empty'              => [ '', null ],
			'zero'               => [ '0', null ],
			'leading zero'       => [ '01', null ],
			'negative'           => [ '-1', null ],
			'plus sign'          => [ '+1', null ],
			'decimal'            => [ '1.5', null ],
			'exponent'           => [ '1e2', null ],
			'words'              => [ 'yes', null ],
			'digits and text'    => [ '1 beta', null ],
			'too large'          => [ '10000', null ],
			'huge'               => [ '99999999999999999999', null ],
			'binary'             => [ '0b11', null ],
			'unicode digits'     => [ "\u{0661}", null ],
			'newline inside'     => [ "1\n2", null ],
		];
	}

	/**
	 * Accepts a positive integer in plain digits and nothing else.
	 *
	 * @param string|false|null $value    Header value.
	 * @param int|null          $expected Parsed version.
	 */
	#[DataProvider( 'values' )]
	public function test_header_values( string|false|null $value, ?int $expected ): void {
		$this->assertSame( $expected, Compat::from_value( $value ) );
	}

	/**
	 * Child theme precedence: absent inherits, valid wins (even when different), invalid means not compatible.
	 *
	 * @return array<string, array{string, string, int|null}>
	 */
	public static function child_cases(): array {
		return [
			'no headers at all'                     => [ '', '', null ],
			'child absent, parent valid'            => [ '', '2', 2 ],
			'child absent, parent invalid'          => [ '', 'x', null ],
			'child valid, parent absent'            => [ '3', '', 3 ],
			'child valid and different'             => [ '3', '2', 3 ],
			'child valid and equal'                 => [ '2', '2', 2 ],
			'child invalid, parent valid'           => [ 'x', '2', null ],
			'child zero, parent valid'              => [ '0', '2', null ],
			'child only whitespace counts as empty' => [ "  \t", '2', 2 ],
		];
	}

	/**
	 * Resolves the declaration of a child theme and its parent.
	 *
	 * @param string   $own      Own raw header value.
	 * @param string   $inherited   Parent raw header value.
	 * @param int|null $expected Result.
	 */
	#[DataProvider( 'child_cases' )]
	public function test_child_theme_precedence( string $own, string $inherited, ?int $expected ): void {
		$this->assertSame( $expected, Compat::resolve( $own, $inherited ) );
	}

	/**
	 * The theme implements the version it declares, and style.css declares it.
	 */
	public function test_style_css_declares_the_current_version(): void {
		$css = (string) file_get_contents( dirname( __DIR__ ) . '/style.css' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test reads a local file.
		$this->assertSame( 1, preg_match( '/^Blixis-Compat:[ \t]*(\S+)[ \t]*$/m', $css, $match ) );
		$this->assertSame( Compat::CURRENT, Compat::from_value( $match[1] ?? null ) );
		$this->assertSame( 'Blixis-Compat', Compat::HEADER );
	}
}
