<?php
/**
 * Visitor website appearance tests (BWB-113).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

require_once __DIR__ . '/AppearanceVisitorStubs.php';
require_once dirname( __DIR__ ) . '/src/Appearance.php';
require_once dirname( __DIR__ ) . '/src/AppearanceToggle.php';

use Blixis\Theme\Appearance;
use PHPUnit\Framework\TestCase;
use function Blixis\Theme\blixis_appearance_toggle;

/** Visitor-only output tests. */
final class AppearanceVisitorTest extends TestCase {
	/** Restore test globals. */
	protected function tearDown(): void {
		unset( $GLOBALS['blixis_test_mode'], $GLOBALS['blixis_test_translation'] );
	}

	/** The control is hidden and fully named only for Auto. */
	public function test_control(): void {
		$GLOBALS['blixis_test_mode']        = 'auto';
		$GLOBALS['blixis_test_translation'] = [
			'Appearance' => 'Mode "<site>"',
			'Light'      => 'Light <mode>',
		];
		\ob_start();
		blixis_appearance_toggle();
		$html = (string) \ob_get_clean();
		$this->assertStringContainsString( 'class="appearance-toggle"', $html );
		$this->assertStringContainsString( ' hidden', $html );
		$this->assertStringContainsString( 'role="group" aria-label="Mode &quot;&lt;site&gt;&quot;"', $html );
		$this->assertStringContainsString( 'Light &lt;mode&gt;', $html );
		$this->assertSame( 3, \substr_count( $html, '<button type="button"' ) );
		$this->assertSame( 1, \substr_count( $html, 'aria-pressed="true"' ) );
		$this->assertStringContainsString( 'aria-live="polite"', $html );
		foreach ( [ 'light', 'dark' ] as $mode ) {
			$GLOBALS['blixis_test_mode'] = $mode;
			\ob_start();
			blixis_appearance_toggle();
			$this->assertSame( '', (string) \ob_get_clean() );
		}
	}

	/** Only auto prints the inline initializer after the meta. */
	public function test_head_output(): void {
		foreach ( [ 'auto', 'light', 'dark' ] as $mode ) {
			$GLOBALS['blixis_test_mode'] = $mode;
			\ob_start();
			Appearance::print_meta();
			$output = (string) \ob_get_clean();
			$this->assertStringContainsString( 'name="color-scheme" content="' . Appearance::meta_content( $mode ) . '">', $output );
			if ( 'auto' === $mode ) {
				$this->assertStringContainsString( '<script>' . Appearance::INITIALIZER . '</script>', $output );
			}
			$this->assertSame( 'auto' === $mode, \str_contains( $output, '<script>' ) );
		}
	}

	/** The shipped constant exactly matches the readable source stripped of indentation. */
	public function test_initializer_source_and_cache_boundary(): void {
		$source = (string) \file_get_contents( dirname( __DIR__ ) . '/assets/js/appearance-init.js' );
		$source = \preg_replace( '~(/\*.*?\*/|//[^\n]*)~s', '', $source );
		$this->assertNotNull( $source );
		$minified = \preg_replace( '/\s*(===|=|\|\||[{}(),;])\s*/', '$1', $source );
		$this->assertNotNull( $minified );
		$minified = \preg_replace( '/\s+/', ' ', $minified );
		$this->assertNotNull( $minified );
		$minified = \str_replace( [ 'function (', 'if (', 'catch (' ], [ 'function(', 'if(', 'catch(' ], $minified );
		$this->assertSame( $minified, Appearance::INITIALIZER );
		$this->assertLessThan( 400, \strlen( Appearance::INITIALIZER ) );
		$this->assertStringNotContainsString( '$_COOKIE', (string) \file_get_contents( dirname( __DIR__ ) . '/src/Appearance.php' ) );
		$this->assertStringNotContainsString( '$_SERVER', (string) \file_get_contents( dirname( __DIR__ ) . '/src/Appearance.php' ) );
	}

	/** The CSP hash covers exactly the bytes passed to the inline script tag. */
	public function test_initializer_csp_hash(): void {
		$this->assertSame( 'sha256-' . \base64_encode( \hash( 'sha256', Appearance::INITIALIZER, true ) ), Appearance::init_script_csp_hash() ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- The CSP digest must be base64 encoded.
	}

	/** Visitor request data must not vary shared-cache HTML. */
	public function test_auto_output_is_independent_of_visitor_request(): void {
		$GLOBALS['blixis_test_mode'] = 'auto';
		$original_cookies            = $_COOKIE;
		$original_server             = $_SERVER;
		$outputs                     = [];
		try {
			foreach ( [
				[
					'blixis-appearance' => 'dark',
					'visitor'           => 'first',
				],
				[
					'blixis-appearance' => 'light',
					'visitor'           => 'second',
				],
			] as $index => $cookies ) {
				$_COOKIE                         = $cookies;
				$_SERVER['HTTP_USER_AGENT']      = 0 === $index ? 'First browser' : 'Second browser';
				$_SERVER['HTTP_ACCEPT_LANGUAGE'] = 0 === $index ? 'nl-NL,nl;q=0.9' : 'en-US,en;q=0.9';
				\ob_start();
				Appearance::print_meta();
				$outputs['head'][] = (string) \ob_get_clean();
				\ob_start();
				blixis_appearance_toggle();
				$outputs['control'][] = (string) \ob_get_clean();
			}
		} finally {
			$_COOKIE = $original_cookies;
			$_SERVER = $original_server;
		}
		$this->assertSame( $outputs['head'][0], $outputs['head'][1] );
		$this->assertSame( $outputs['control'][0], $outputs['control'][1] );
	}
}
