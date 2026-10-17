<?php
/** Template REST policy tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Rest\TemplateController;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();
/** Route capability and body policy tests. */
final class TemplateControllerTest extends TestCase {
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Auth gates and empty request body policy. */
	public function test_route_permissions_and_strict_empty_install_body(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Define WordPress functions and request types in this isolated test process only.
		eval( 'namespace { $GLOBALS["blixis_template_routes"]=[]; $GLOBALS["blixis_template_allowed"]=false; function current_user_can($cap) { return $GLOBALS["blixis_template_allowed"]; } function register_rest_route($ns,$route,$args) { $GLOBALS["blixis_template_routes"][]=$route; } }' );
		$this->assertFalse( TemplateController::permission() );
		$GLOBALS['blixis_template_allowed'] = true;
		$this->assertTrue( TemplateController::permission() );
		TemplateController::register();
		$this->assertCount( 3, $GLOBALS['blixis_template_routes'] );
		$this->assertTrue( TemplateController::has_empty_body( '' ) );
		$this->assertFalse( TemplateController::has_empty_body( '{}' ) );
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Unknown template IDs return the documented 404 for detail and font routes. */
	public function test_unknown_template_routes_return_404(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Isolated WordPress request and error stubs.
		eval( 'namespace { class WP_Error { public $errors=[]; public function __construct(public $code, public $message, public $data = []) { $this->errors=[$code=>[$message]]; } } class WP_REST_Request { private $params=[]; public function __construct($method="GET",$route="/") {} public function set_url_params($params) { $this->params=$params; } public function get_url_params() { return $this->params; } public function get_body() { return ""; } } function plugins_url($path,$plugin="") { return "https://example.test/".$path; } function get_posts($args=[]) { return []; } }' );
		$request = $this->createMock( \WP_REST_Request::class );
		$request->method( 'get_url_params' )->willReturn( [ 'id' => 'not-a-pack' ] );
		$request->method( 'get_body' )->willReturn( '' );
		$detail = TemplateController::detail( $request );
		if ( ! $detail instanceof \WP_Error ) {
			self::fail( 'Unknown template detail did not return WP_Error.' ); }
		$this->assertSame( 'blixis_template_not_found', $detail->code );
		$install = TemplateController::install( $request );
		if ( ! $install instanceof \WP_Error ) {
			self::fail( 'Unknown template install did not return WP_Error.' ); }
		$this->assertSame( 'blixis_template_not_found', $install->code );
	}
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** A failed installation counts toward the per-user request limit. */
	public function test_failed_font_install_attempts_are_rate_limited(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Isolated WordPress transient and REST stubs.
		eval( 'namespace { $GLOBALS["blx_template_limits"] = []; $GLOBALS["blixis_font_locks"] = []; class WP_Error { public $errors=[]; public function __construct(public $code, public $message, public $data = []) { $this->errors=[$code=>[$message]]; } } class WP_REST_Request { private $params=[]; public function __construct($method="GET",$route="/") {} public function set_url_params($params) { $this->params=$params; } public function get_url_params() { return $this->params; } public function get_body() { return ""; } } function plugins_url($path,$plugin="") { return "https://example.test/".$path; } function get_posts($args=[]) { return []; } function current_user_can($cap) { return false; } function get_current_user_id() { return 55; } function add_option($key,$value,$deprecated="",$autoload=false) { if (isset($GLOBALS["blixis_font_locks"][$key])) return false; $GLOBALS["blixis_font_locks"][$key]=$value; return true; } function get_option($key,$default=false) { return $GLOBALS["blixis_font_locks"][$key] ?? $default; } function delete_option($key) { unset($GLOBALS["blixis_font_locks"][$key]); return true; } function get_transient($key) { return $GLOBALS["blx_template_limits"][$key] ?? false; } function set_transient($key,$value,$expiration) { $GLOBALS["blx_template_limits"][$key]=$value; return true; } }' );
		$request = $this->createMock( \WP_REST_Request::class );
		$request->method( 'get_url_params' )->willReturn( [ 'id' => 'business' ] );
		$request->method( 'get_body' )->willReturn( '' );
		foreach ( [ 'plus-jakarta-sans', 'inter', 'space-grotesk', 'dm-sans', 'manrope', 'outfit' ] as $slug ) {
			$GLOBALS['blixis_font_locks'][ 'blx_font_family_lock_' . $slug ] = time() + 30;
		}
		$busy = TemplateController::install( $request );
		if ( ! $busy instanceof \WP_Error ) {
			self::fail( 'Expected active font family lock error.' ); }
		$this->assertSame( 'blixis_conflict', $busy->code );
		$GLOBALS['blixis_font_locks'] = [];
		for ( $i = 0; $i < 29; ++$i ) {
			$result = TemplateController::install( $request );
			if ( ! $result instanceof \WP_Error ) {
				self::fail( 'Expected failed font install error.' ); }
			$this->assertSame( 'blixis_font_install_failed', $result->code );
		}
		$limited = TemplateController::install( $request );
		if ( ! $limited instanceof \WP_Error ) {
			self::fail( 'Expected rate limit error.' ); }
		$this->assertSame( 'blixis_rate_limited', $limited->code );
	}
}
