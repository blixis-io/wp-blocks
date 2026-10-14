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

if ( ! defined( 'ABSPATH' ) ) {
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
		return array(
			'one'                => array( '1', 1 ),
			'two digits'         => array( '12', 12 ),
			'the maximum'        => array( '9999', 9999 ),
			'surrounding spaces' => array( "  3\t", 3 ),
			'missing header'     => array( false, null ),
			'null'               => array( null, null ),
			'empty'              => array( '', null ),
			'zero'               => array( '0', null ),
			'leading zero'       => array( '01', null ),
			'negative'           => array( '-1', null ),
			'plus sign'          => array( '+1', null ),
			'decimal'            => array( '1.5', null ),
			'exponent'           => array( '1e2', null ),
			'words'              => array( 'yes', null ),
			'digits and text'    => array( '1 beta', null ),
			'too large'          => array( '10000', null ),
			'huge'               => array( '99999999999999999999', null ),
			'binary'             => array( '0b11', null ),
			'unicode digits'     => array( "\u{0661}", null ),
			'newline inside'     => array( "1\n2", null ),
		);
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
	 * The theme implements the version it declares, and style.css declares it.
	 */
	public function test_style_css_declares_the_current_version(): void {
		$css = (string) file_get_contents( dirname( __DIR__ ) . '/style.css' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test reads a local file.
		$this->assertSame( 1, preg_match( '/^Blixis-Compat:[ \t]*(\S+)[ \t]*$/m', $css, $match ) );
		$this->assertSame( Compat::CURRENT, Compat::from_value( $match[1] ?? null ) );
		$this->assertSame( 'Blixis-Compat', Compat::HEADER );
	}
}
