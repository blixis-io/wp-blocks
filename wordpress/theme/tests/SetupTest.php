<?php
/**
 * Tests for the theme setup description (BWB-029).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\Setup;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Stands in for WordPress so the guarded theme files load.
}
require_once dirname( __DIR__ ) . '/src/Setup.php';

/**
 * The declared theme features and the template set.
 */
final class SetupTest extends TestCase {

	/**
	 * The features the templates rely on are declared.
	 */
	public function test_features(): void {
		$features = Setup::features();
		foreach ( array( 'title-tag', 'post-thumbnails', 'html5', 'responsive-embeds', 'automatic-feed-links' ) as $name ) {
			$this->assertArrayHasKey( $name, $features );
		}
		$this->assertContains( 'comment-form', $features['html5'] );
		$this->assertContains( 'search-form', $features['html5'] );
	}

	/**
	 * The template hierarchy has the files WordPress needs and every template ends the page properly.
	 */
	public function test_templates_exist_and_are_well_formed(): void {
		$root = dirname( __DIR__ );
		foreach ( array( 'style.css', 'index.php', 'functions.php', 'header.php', 'footer.php', 'single.php', 'page.php', 'archive.php', 'search.php', '404.php', 'comments.php' ) as $file ) {
			$this->assertFileExists( $root . '/' . $file );
		}
		foreach ( array( 'single.php', 'page.php', 'archive.php', 'search.php', '404.php', 'index.php' ) as $file ) {
			$source = (string) file_get_contents( $root . '/' . $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test reads a local file.
			$this->assertStringContainsString( 'get_header()', $source, $file );
			$this->assertStringContainsString( 'get_footer()', $source, $file );
		}
	}

	/**
	 * The page chrome keeps the accessibility landmarks: skip link, main landmark and the hooks plugins need.
	 */
	public function test_header_and_footer_keep_landmarks_and_hooks(): void {
		$header = (string) file_get_contents( dirname( __DIR__ ) . '/header.php' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test reads a local file.
		$footer = (string) file_get_contents( dirname( __DIR__ ) . '/footer.php' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test reads a local file.
		foreach ( array( 'skip-link', 'id="content"', '<main', 'wp_head()', 'wp_body_open()', 'language_attributes()', 'name="viewport"' ) as $needle ) {
			$this->assertStringContainsString( $needle, $header, $needle );
		}
		foreach ( array( '</main>', 'wp_footer()', '</html>' ) as $needle ) {
			$this->assertStringContainsString( $needle, $footer, $needle );
		}
	}

	/**
	 * The static theme asset follows the token stylesheet and uses the theme version.
	 */
	public function test_compiled_theme_style_is_enqueued(): void {
		$styles = Setup::styles( 'https://example.test/child/style.css', 'https://example.test/blixis', '0.1.0' );
		$this->assertSame( array( 'blixis-style', 'blixis-tokens', 'blixis-theme' ), array_keys( $styles ) );
		$this->assertSame( 'https://example.test/blixis/assets/css/tokens.css', $styles['blixis-tokens']['url'] );
		$this->assertSame( array( 'blixis-style' ), $styles['blixis-tokens']['dependencies'] );
		$this->assertSame( '0.1.0', $styles['blixis-tokens']['version'] );
		$this->assertSame( 'https://example.test/blixis/assets/css/theme.css', $styles['blixis-theme']['url'] );
		$this->assertSame( array( 'blixis-tokens' ), $styles['blixis-theme']['dependencies'] );
		$this->assertSame( '0.1.0', $styles['blixis-theme']['version'] );
		$this->assertFileExists( dirname( __DIR__ ) . '/assets/css/tokens.css' );
		$this->assertFileExists( dirname( __DIR__ ) . '/assets/css/theme.css' );
	}
}
