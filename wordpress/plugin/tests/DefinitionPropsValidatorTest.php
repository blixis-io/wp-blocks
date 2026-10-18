<?php
/** V2 property validation tests using production-shaped JSON objects.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Registry\DefinitionPropsValidator;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); } // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();

/** Definition property persistence validation tests. */
final class DefinitionPropsValidatorTest extends TestCase {
	/** V2 props reject wrong types and properties outside the element definition. */
	public function test_rejects_wrong_typed_and_unknown_properties(): void {
		$validator = new DefinitionPropsValidator( ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' ) );
		$wrong     = json_decode( '{"id":"head-1","type":"heading","props":{"content":5},"children":[]}' );
		$unknown   = json_decode( '{"id":"head-1","type":"heading","props":{"unregistered":"x"},"children":[]}' );
		$valid     = json_decode( '{"id":"head-1","type":"heading","props":{"content":"Hello"},"children":[]}' );
		$this->assertFalse( $validator->accepts( $wrong ) );
		$this->assertFalse( $validator->accepts( $unknown ) );
		$this->assertTrue( $validator->accepts( $valid ) );
	}

	/** Existing core image and section props remain writable after their generated definitions are enabled. */
	public function test_accepts_legacy_media_and_section_props(): void {
		$validator = new DefinitionPropsValidator( ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' ) );
		$legacy    = json_decode( '{"id":"legacy-page","type":"blixis/section","props":{"tag":"main"},"children":[{"id":"legacy-heading","type":"blixis/heading","props":{"level":1},"children":[]},{"id":"legacy-button","type":"blixis/button","props":{"variant":"solid"},"children":[]},{"id":"legacy-image","type":"blixis/image","props":{"attachmentId":30,"alt":"Example"},"children":[]}]}' );
		$invalid   = json_decode( '{"id":"legacy-page","type":"blixis/section","props":{"tag":"script"},"children":[]}' );
		$this->assertTrue( $validator->accepts( $legacy ) );
		$this->assertFalse( $validator->accepts( $invalid ) );
	}

	/** Existing bounded container widths remain writable while arbitrary width values are rejected. */
	public function test_accepts_only_known_legacy_container_widths(): void {
		$validator = new DefinitionPropsValidator( ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' ) );
		$legacy    = json_decode( '{"id":"legacy-container","type":"blixis/container","props":{"maxWidth":"default"},"children":[]}' );
		$invalid   = json_decode( '{"id":"legacy-container","type":"blixis/container","props":{"maxWidth":"calc(100vw)"},"children":[]}' );
		$this->assertTrue( $validator->accepts( $legacy ) );
		$this->assertFalse( $validator->accepts( $invalid ) );
	}

	/** Media references accept nullable defaults and approved WordPress attachment IDs. */
	public function test_accepts_media_manifest_refs_and_attachment_ids(): void {
		$validator = new DefinitionPropsValidator( ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' ) );
		$valid     = json_decode( '{"id":"video-1","type":"blixis/video","props":{"src":"attachment:42","poster":null},"children":[]}' );
		$invalid   = json_decode( '{"id":"video-1","type":"blixis/video","props":{"src":"https://evil.test/video.mp4"},"children":[]}' );
		$this->assertTrue( $validator->accepts( $valid ) );
		$this->assertFalse( $validator->accepts( $invalid ) );
	}

	/** Array item types are recursively checked for attachment-backed asset references. */
	public function test_validates_array_asset_references(): void {
		$validator = new DefinitionPropsValidator( ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' ) );
		$valid     = json_decode( '{"id":"avatar-group-1","type":"blixis/avatar-group","props":{"assets":["attachment:42","asset:profile"]},"children":[]}' );
		$invalid   = json_decode( '{"id":"avatar-group-2","type":"blixis/avatar-group","props":{"assets":["javascript:alert(1)"]},"children":[]}' );
		$this->assertTrue( $validator->accepts( $valid ) );
		$this->assertFalse( $validator->accepts( $invalid ) );
	}

	/** Icon references accept only the glyphs that the local SVG renderer can safely draw. */
	public function test_validates_local_icon_references(): void {
		$validator = new DefinitionPropsValidator( ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' ) );
		$valid     = json_decode( '{"id":"icon-svg1","type":"blixis/icon-svg","props":{"icon":"solar:info-circle-linear","size":48},"children":[]}' );
		$invalid   = json_decode( '{"id":"icon-svg1","type":"blixis/icon-svg","props":{"icon":"evil:script"},"children":[]}' );
		$this->assertTrue( $validator->accepts( $valid ) );
		$this->assertFalse( $validator->accepts( $invalid ) );
	}
}
