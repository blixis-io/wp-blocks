<?php
/** Admin menu contract tests.
 *
 * @package Blixis\Builder\Tests
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Admin\AdminMenu;
use Blixis\Builder\Templates\TemplateCard;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();

/** Menu registration order and Settings API sanitation. */
final class AdminMenuTest extends TestCase {
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Submenus are registered in the approved order with individual capabilities. */
	public function test_submenus_have_expected_order_and_capabilities(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- These WordPress hooks are isolated test doubles.
		eval( 'namespace { $GLOBALS["submenu"] = []; $GLOBALS["blx_admin_rows"] = []; function __( $text, $domain = "" ) { return $text; } function add_menu_page( $title, $menu, $capability, $slug, $callback, $icon, $position ) { $GLOBALS["submenu"][$slug][] = [ $menu, $capability, $slug, $title ]; $GLOBALS["blx_top_menu"] = [ $icon, $position ]; } function add_submenu_page( $parent, $title, $menu, $capability, $slug, $callback ) { $GLOBALS["submenu"][$parent][] = [ $menu, $capability, $slug, $title ]; $GLOBALS["blx_admin_rows"][] = [ $slug, $capability, $callback ]; } }' );
		AdminMenu::menu();
		$this->assertSame( [ 'blixis-setup', 'blixis-global-styles', 'blixis-templates', 'blixis-theme-builder', 'blixis-assets', 'blixis-settings', 'blixis-help' ], array_column( $GLOBALS['submenu']['blixis'], 2 ) );
		$this->assertSame( [ 'edit_theme_options', 'edit_theme_options', 'edit_theme_options', 'edit_theme_options', 'upload_files', 'manage_options', 'edit_theme_options' ], array_column( $GLOBALS['blx_admin_rows'], 1 ) );
		$this->assertSame( 25.5, $GLOBALS['blx_top_menu'][1] );
		$this->assertStringStartsWith( 'data:image/svg+xml;base64,', $GLOBALS['blx_top_menu'][0] );
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Decode the registered icon for an exact test assertion.
		$this->assertStringContainsString( 'fill="black"', (string) base64_decode( substr( $GLOBALS['blx_top_menu'][0], strlen( 'data:image/svg+xml;base64,' ) ) ) );
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** The settings option accepts only the supported checkbox values. */
	public function test_settings_option_uses_strict_boolean_sanitization(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- The setting registry is isolated from WordPress.
		eval( 'namespace { function register_setting( $group, $name, $args ) { $GLOBALS["setting_args"] = $args; } function add_settings_section( ...$args ) {} function add_settings_field( ...$args ) {} function __( $text, $domain = "" ) { return $text; } }' );
		AdminMenu::settings();
		$sanitize = $GLOBALS['setting_args']['sanitize_callback'];
		$this->assertTrue( $sanitize( '1' ) );
		$this->assertTrue( $sanitize( 'on' ) );
		$this->assertFalse( $sanitize( '<script>' ) );
		$this->assertFalse( $sanitize( 'true' ) );
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** The template card renderer escapes all supplied text and never prints its source directory. */
	public function test_template_cards_escape_output_and_hide_source_paths(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Output escaping helpers are isolated test doubles.
		eval( 'namespace { function __( $text, $domain = "" ) { return $text; } function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8" ); } function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8" ); } function esc_url( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8" ); } }' );
		$card   = new TemplateCard(
			[
				'id'          => 'safe-id',
				'name'        => '<script>alert(1)</script>',
				'category'    => '<b>category</b>',
				'description' => '<img src=x onerror=alert(1)>',
				'previewUrl'  => 'https://example.test/preview.webp',
				'fonts'       => [
					[
						'family'    => '<svg onload=alert(1)>',
						'installed' => false,
					],
				],
			],
			'/private/template/source'
		);
		$method = new \ReflectionMethod( AdminMenu::class, 'template_cards' );
		ob_start();
		$method->invoke( null, [ $card ] );
		$html = (string) ob_get_clean();
		$this->assertStringNotContainsString( '<script>', $html );
		$this->assertStringContainsString( '&lt;script&gt;', $html );
		$this->assertStringContainsString( '&lt;img src=x onerror=alert(1)&gt;', $html );
		$this->assertStringContainsString( '&lt;svg onload=alert(1)&gt;', $html );
		$this->assertStringNotContainsString( '/private/template/source', $html );
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** The license panel clearly identifies its demo state and never emits a real key. */
	public function test_license_panel_is_an_explicit_non_persistent_mock(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Escaping and URL functions are isolated WordPress test doubles.
		eval( 'namespace { function esc_html__( $text, $domain = "" ) { return htmlspecialchars( (string) $text, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8" ); } function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8" ); } function wp_parse_url( $url, $component = -1 ) { return parse_url( $url, $component ); } function home_url( $path = "/" ) { return "https://blixis.test" . $path; } }' );
		$method = new \ReflectionMethod( AdminMenu::class, 'license_mock' );
		ob_start();
		$method->invoke( null );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'data-license-mock', $html );
		$this->assertStringContainsString( 'Demo preview', $html );
		$this->assertStringContainsString( 'no license server is connected', $html );
		$this->assertStringContainsString( 'data-license-renew', $html );
		$this->assertStringContainsString( 'data-license-replace', $html );
		$this->assertStringContainsString( 'BLIXIS-PRO-DEMO-', $html );
		$this->assertStringNotContainsString( 'license_key', $html );
	}
}
