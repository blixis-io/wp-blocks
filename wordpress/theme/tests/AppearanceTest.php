<?php
/**
 * Website appearance output tests (BWB-108).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\Appearance;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test stand-in.
}
require_once dirname( __DIR__ ) . '/src/Appearance.php';

/** Pure option and markup rules. */
final class AppearanceTest extends TestCase {
	/** Invalid or absent values follow the system. */
	public function test_normalize(): void {
		foreach ( [ 'auto', 'light', 'dark' ] as $mode ) {
			$this->assertSame( $mode, Appearance::normalize( $mode ) );
		}
		foreach ( [ false, null, '', 'DARK', 'system', 0, [ 'dark' ] ] as $invalid ) {
			$this->assertSame( 'auto', Appearance::normalize( $invalid ) );
		}
	}

	/** Forced modes add one attribute; auto and another plugin's attribute are preserved. */
	public function test_html_attributes(): void {
		$this->assertSame( 'lang="en"', Appearance::html_attributes( 'lang="en"', 'auto' ) );
		$this->assertSame( 'lang="en" data-theme="dark"', Appearance::html_attributes( 'lang="en"', 'dark' ) );
		$this->assertSame( 'lang="en" data-theme="light"', Appearance::html_attributes( 'lang="en"', 'light' ) );
		$this->assertSame( 'lang="en"', Appearance::html_attributes( 'lang="en"', 'invalid' ) );
		$this->assertSame( 'lang="en" data-theme="light"', Appearance::html_attributes( 'lang="en" data-theme="light"', 'dark' ) );
		$this->assertSame( "lang='en' DATA-THEME = 'auto'", Appearance::html_attributes( "lang='en' DATA-THEME = 'auto'", 'dark' ) );
	}

	/** Native controls receive the same effective site preference. */
	public function test_meta_content(): void {
		$this->assertSame( 'light dark', Appearance::meta_content( 'auto' ) );
		$this->assertSame( 'light dark', Appearance::meta_content( 'invalid' ) );
		$this->assertSame( 'light', Appearance::meta_content( 'light' ) );
		$this->assertSame( 'dark', Appearance::meta_content( 'dark' ) );
	}
}
