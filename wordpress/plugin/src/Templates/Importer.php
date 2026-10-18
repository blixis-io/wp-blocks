<?php
/** Import validated bundled template pages as drafts.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Publication\WordPressAuditSink;
use Blixis\Builder\Publication\WordPressRateLimiter;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\RevisionRing;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WordPressRevisionContext;
use Blixis\Builder\Storage\WpdbDatabase;

\defined( 'ABSPATH' ) || exit;

/** Performs an allowlist-only, rollback-capable import of local bundled packs. */
final class Importer {
	public const ASSET_META      = '_blixis_template_asset_file';
	private const ASSET_REF_META = '_blixis_template_asset_ref';

	/** Create the importer.
	 *
	 * @param Library|null $library Template catalogue.
	 */
	public function __construct( private readonly ?Library $library = null ) {}

	/** Import pages and local pack assets.
	 *
	 * @param string              $id Template id.
	 * @param array<string,mixed> $options Strictly decoded options.
	 * @param bool                $rate_limited Whether the REST adapter already consumed the request bucket.
	 * @return array<string,mixed>|\WP_Error
	 * @throws \RuntimeException When a WordPress operation fails; created data is rolled back.
	 */
	public function import( string $id, array $options, bool $rate_limited = false ): array|\WP_Error {
		if ( ! current_user_can( 'edit_pages' ) || ! current_user_can( 'edit_theme_options' ) ) {
			return new \WP_Error( 'rest_forbidden', 'You cannot import templates.', [ 'status' => 403 ] );
		}
		if ( ! $rate_limited ) {
			$limit = self::record_attempt( get_current_user_id() );
			if ( is_wp_error( $limit ) ) {
				return $limit;
			}
		}
		$library = $this->library ?? Library::instance();
		$card    = $library->find( $id );
		if ( null === $card ) {
			return new \WP_Error( 'blixis_template_not_found', 'Template not found.', [ 'status' => 404 ] );
		}
		if ( empty( $card->data['importable'] ) ) {
			return new \WP_Error(
				'blixis_template_not_importable',
				'This template cannot be imported yet.',
				[
					'status'  => 422,
					'reasons' => $this->reasons( $card->directory ),
				]
			);
		}
		$data     = json_decode( (string) file_get_contents( $card->directory . '/template.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Validated bundled pack.
		$declared = $data['importOptions'] ?? [];
		$options  = self::normalize_options( $declared, $options );
		if ( is_wp_error( $options ) ) {
			return $options;
		}
		if ( ! empty( $options['setHomePage'] ) && empty( $options['createPages'] ) ) {
			return new \WP_Error( 'blixis_invalid_template_request', 'A homepage can only be selected when template pages are created.', [ 'status' => 400 ] );
		}
		if ( empty( $options['createPages'] ) && empty( $options['createNavigation'] ) ) {
			return [
				'templateId' => $id,
				'pages'      => [],
				'assets'     => [],
			];
		}
		if ( ! empty( $options['createPages'] ) ) {
			foreach ( $data['documents'] as $document ) {
				$matches = $this->matching_pages( $id, (string) $document['id'] );
				if ( $matches && ( empty( $options['overwriteExisting'] ) || 0 === $this->existing_page( $id, (string) $document['id'] ) ) ) {
					return new \WP_Error( 'blixis_template_already_imported', 'This template already has an imported page that cannot be overwritten.', [ 'status' => 409 ] );
				}
			}
		}
		$created_posts  = [];
		$created_media  = [];
		$created_menus  = [];
		$modified_pages = [];
		$results        = [];
		$home_front     = get_option( 'show_on_front', false );
		$home_page      = get_option( 'page_on_front', false );
		try {
			$assets = ! empty( $options['createPages'] ) ? $this->sideload_assets( $card->directory, $data['assets'] ?? [], $created_media ) : [];
			global $wpdb;
			$db                      = new WpdbDatabase( $wpdb );
			$streams                 = new StreamStore( $db, null, new RevisionRing( $db, new WordPressRevisionContext() ) );
			$definitions             = ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__, 2 ) . '/data/element-definitions-v2.json' );
			$notes                   = [];
			$site_locales            = LocaleConfig::from_option( get_option( LocaleConfig::OPTION, false ), get_locale() );
			$template_locales        = array_values( array_filter( array_keys( $data['localizations'] ?? [] ), 'is_string' ) );
			$locale_map              = self::map_template_locales( (string) ( $data['template']['defaultLocale'] ?? '' ), $template_locales, $site_locales->enabled, $site_locales->default_locale, $notes );
			$default_template_locale = (string) ( $data['template']['defaultLocale'] ?? '' );
			$locale                  = $locale_map[ $default_template_locale ] ?? $site_locales->default_locale;
			foreach ( $data['documents'] as $document ) {
				if ( empty( $options['createPages'] ) ) {
					continue;
				}
				if ( empty( $document['importable'] ) ) {
					throw new \RuntimeException( 'Template contains a blocked document.' );
				}
				$post_id = $this->existing_page( $id, (string) $document['id'] );
				if ( $post_id ) {
					if ( ! current_user_can( 'edit_post', $post_id ) ) {
						throw new \RuntimeException( 'Template page cannot be edited.' ); }
					$prior            = get_post( $post_id );
					$meta             = get_post_meta( $post_id );
					$modified_pages[] = [
						'id'      => $post_id,
						'post'    => $prior,
						'streams' => array_filter( $meta, static fn( $key ) => MetaKeys::LAYOUT === $key || 0 === strpos( (string) $key, '_blixis_content_' ) || MetaKeys::is_revision( (string) $key ), ARRAY_FILTER_USE_KEY ),
					];
					foreach ( array_keys( $meta ) as $meta_key ) {
						if ( is_string( $meta_key ) && ( MetaKeys::LAYOUT === $meta_key || 0 === strpos( $meta_key, '_blixis_content_' ) ) ) {
							delete_post_meta( $post_id, $meta_key );
						}
					}
				}
				$root                 = $this->resolve_assets( $document['root'], $assets );
				$streams_for_document = self::document_streams( $root, $definitions, $locale, $notes, $data['designTokens']['colors']['light'] ?? [] );
				$types_by_id          = $this->tree_types( $document['root'] );
				$post_data            = [
					'post_type'   => 'page',
					'post_status' => 'draft',
					'post_title'  => sanitize_text_field( $document['title'] ),
					'post_name'   => sanitize_title( $document['slug'] ?? $document['id'] ),
					'meta_input'  => [
						'_blixis_template_import'   => $id,
						'_blixis_template_document' => $document['id'],
					],
				];
				if ( $post_id ) {
					$post_data['ID'] = $post_id;
					$saved           = wp_update_post( $post_data, true );
				} else {
					$saved = wp_insert_post( $post_data, true );
					if ( ! is_wp_error( $saved ) ) {
						$created_posts[] = (int) $saved;
					}
				}
				if ( is_wp_error( $saved ) ) {
					throw new \RuntimeException( 'Unable to create template page.' );
				}
				$post_id = (int) $saved;
				$layout  = wp_json_encode( $streams_for_document['layout'] );
				$write   = $streams->write( $post_id, MetaKeys::LAYOUT, (string) $layout, 0 );
				if ( ! $write->success ) {
					throw new \RuntimeException( 'Unable to store template layout.' );
				}
				$content     = wp_json_encode( $streams_for_document['content'] );
				$default_key = MetaKeys::content( $locale );
				if ( ! MetaKeys::is_valid_key( $default_key ) || ! $streams->write( $post_id, $default_key, (string) $content, 0 )->success ) {
					throw new \RuntimeException( 'Unable to store template content.' );
				}
				foreach ( $data['localizations'] ?? [] as $template_locale => $localized_data ) {
					$localized_locale = $locale_map[ (string) $template_locale ] ?? null;
					if ( null === $localized_locale || $localized_locale === $locale || ! is_array( $localized_data ) ) {
						continue;
					}
					$localized     = wp_json_encode( self::localization_stream( $localized_data, $types_by_id, $definitions, $localized_locale, $data['designTokens']['colors']['light'] ?? [], $notes ) );
					$localized_key = MetaKeys::content( $localized_locale );
					if ( ! MetaKeys::is_valid_key( $localized_key ) || ! $streams->write( $post_id, $localized_key, (string) $localized, 0 )->success ) {
						throw new \RuntimeException( 'Unable to store template translations.' );
					}
				}
				$results[] = [
					'document' => $document['id'],
					'postId'   => $post_id,
					'status'   => 'draft',
				];
			}
			if ( ! empty( $options['setHomePage'] ) && $results ) {
				$notes[] = 'Homepage selection was deferred because imported pages are drafts.'; }
			if ( ! empty( $options['createNavigation'] ) ) {
				$this->create_navigation( $id, $data['documents'], $created_menus );
			}
			( new WordPressAuditSink() )->emit( new AuditEvent( get_current_user_id(), 0, null, 'template-import', null, null, 0, null, $id, array_keys( $assets ) ) );
			return [
				'templateId' => $id,
				'pages'      => $results,
				'assets'     => $assets,
				'notes'      => $notes,
			];
		} catch ( \Throwable $error ) {
			foreach ( array_reverse( $created_posts ) as $post_id ) {
				wp_delete_post( $post_id, true );
			}
			foreach ( array_reverse( $modified_pages ) as $backup ) {
				if ( $backup['post'] instanceof \WP_Post ) {
					wp_update_post(
						[
							'ID'          => $backup['id'],
							'post_title'  => $backup['post']->post_title,
							'post_name'   => $backup['post']->post_name,
							'post_status' => $backup['post']->post_status,
						]
					);
				}
				foreach ( $backup['streams'] as $key => $values ) {
					delete_post_meta( $backup['id'], $key );
					foreach ( $values as $value ) {
						add_post_meta( $backup['id'], $key, wp_slash( maybe_unserialize( $value ) ) );
					}
				}
			}
			foreach ( array_reverse( $created_menus ) as $menu_id ) {
				wp_delete_nav_menu( $menu_id );
			}
			if ( false === $home_front ) {
				delete_option( 'show_on_front' );
			} else {
				update_option( 'show_on_front', $home_front );
			}
			if ( false === $home_page ) {
				delete_option( 'page_on_front' );
			} else {
				update_option( 'page_on_front', $home_page );
			}
			foreach ( array_reverse( $created_media ) as $attachment_id ) {
				wp_delete_attachment( $attachment_id, true );
			}
			return new \WP_Error( 'blixis_template_import_failed', 'Template import failed and created content was rolled back.', [ 'status' => 500 ] );
		}
	}

	/** Map template language tags to enabled WordPress locales.
	 *
	 * @param string        $template_default Template's source locale.
	 * @param array<string> $template_locales Locales declared by the pack.
	 * @param array<string> $enabled_locales Enabled site locales.
	 * @param string        $site_default Site's default locale.
	 * @param string[]      $notes Import notes, updated by reference.
	 * @return array<string,string> Template locale to enabled site locale map.
	 */
	public static function map_template_locales( string $template_default, array $template_locales, array $enabled_locales, string $site_default, array &$notes = [] ): array {
		$map = [];
		$all = array_values( array_unique( array_merge( [ $template_default ], $template_locales ) ) );
		foreach ( $all as $template_locale ) {
			if ( ! is_string( $template_locale ) || '' === $template_locale ) {
				continue;
			}
			$normalized = str_replace( '-', '_', $template_locale );
			$candidates = array_values( array_filter( $enabled_locales, static fn ( $candidate ): bool => is_string( $candidate ) && MetaKeys::is_valid_locale( $candidate ) ) );
			$exact      = array_values( array_filter( $candidates, static fn ( string $candidate ): bool => strcasecmp( $candidate, $normalized ) === 0 ) );
			$language   = strtolower( explode( '_', $normalized )[0] );
			$matching   = array_values( array_filter( $candidates, static fn ( string $candidate ): bool => strtolower( explode( '_', $candidate )[0] ) === $language ) );
			$choices    = [] !== $exact ? $exact : $matching;
			if ( in_array( $site_default, $choices, true ) ) {
				$map[ $template_locale ] = $site_default;
			} elseif ( $choices ) {
				$map[ $template_locale ] = $choices[0];
			} else {
				$notes[] = 'Skipped template locale ' . $template_locale . ' because no enabled site locale matches it.';
			}
		}
		return $map;
	}

	/** Build a validated content stream from one pack localization.
	 *
	 * @param array<string,mixed>       $localized_data Pack values keyed by element ID.
	 * @param array<string,string>      $types_by_id Element types keyed by element ID.
	 * @param ElementDefinitionRegistry $definitions Definition registry.
	 * @param string                    $locale Valid WordPress locale.
	 * @param array<string,mixed>       $tokens Allowed color tokens.
	 * @param string[]                  $notes Import notes, updated by reference.
	 * @return array<string,mixed> Content stream envelope.
	 * @throws \InvalidArgumentException When the content key is invalid.
	 */
	public static function localization_stream( array $localized_data, array $types_by_id, ElementDefinitionRegistry $definitions, string $locale, array $tokens, array &$notes ): array {
		if ( ! MetaKeys::is_valid_key( MetaKeys::content( $locale ) ) ) {
			throw new \InvalidArgumentException( 'Invalid locale stream key.' );
		}
		$entries = [];
		foreach ( $localized_data as $element_id => $values ) {
			if ( ! is_array( $values ) ) {
				continue;
			}
			$scalar_values = [];
			$type          = $types_by_id[ (string) $element_id ] ?? '';
			foreach ( $values as $property => $value ) {
				$spec = $definitions->property( 'blixis/' . $type, (string) $property );
				if ( ! is_array( $spec ) || true !== ( $spec['localizable'] ?? false ) ) {
					$notes[] = 'Dropped unsupported localized property ' . (string) $property . ' on ' . (string) $element_id . '.';
					continue;
				}
				$converted = self::convert_template_value( $value, $spec, $tokens, $notes, (string) $property );
				if ( null !== $converted ) {
					$scalar_values[ $definitions->canonical_property( 'blixis/' . $type, (string) $property ) ] = $converted;
				}
			}
			if ( $scalar_values ) {
				$entries[ $element_id ] = [
					'status' => 'draft',
					'values' => (object) $scalar_values,
				];
			}
		}
		return [
			'schemaVersion'   => 1,
			'contentRevision' => 1,
			'locale'          => $locale,
			'entries'         => (object) $entries,
		];
	}
	/** Consume the actor-wide template import request bucket.
	 *
	 * @param int $actor User identifier.
	 * @return true|\WP_Error
	 */
	public static function record_attempt( int $actor ): true|\WP_Error {
		$limiter = new WordPressRateLimiter( 'blximp_' );
		if ( $limiter->retry_after( $actor, 0 ) > 0 ) {
			return new \WP_Error( 'blixis_rate_limited', 'Template import rate limit reached.', [ 'status' => 429 ] );
		}
		$limiter->record( $actor, 0 );
		return true;
	}
	/** Apply declared defaults and reject options outside the template policy.
	 *
	 * @param array<string,mixed> $declared Pack import options.
	 * @param array<string,mixed> $requested Submitted overrides.
	 * @return array<string,bool>|\WP_Error
	 */
	public static function normalize_options( array $declared, array $requested ): array|\WP_Error {
		$allowed = [ 'createPages', 'setHomePage', 'createNavigation', 'overwriteExisting', 'downloadAssets' ];
		foreach ( $declared as $key => $value ) {
			if ( ! in_array( $key, $allowed, true ) || ! is_bool( $value ) ) {
				return new \WP_Error( 'blixis_invalid_template_request', 'Template import configuration is invalid.', [ 'status' => 400 ] );
			}
		}
		foreach ( $requested as $key => $value ) {
			if ( ! in_array( $key, $allowed, true ) || ! is_bool( $value ) || ! array_key_exists( $key, $declared ) || ( $value && ! $declared[ $key ] ) ) {
				return new \WP_Error( 'blixis_invalid_template_request', 'Requested import options exceed the template policy.', [ 'status' => 400 ] );
			}
		}
		return array_merge( $declared, $requested );
	}

	/** Get compatibility reasons for the selected pack.
	 *
	 * @param string $dir Validated pack directory.
	 * @return list<string>
	 */
	private function reasons( string $dir ): array {
		return ( new TemplateValidator() )->importability_reasons( $dir );
	}
	/** Find a prior import by its stable template/document identity.
	 *
	 * @param string $id Template identifier.
	 * @param string $document Document identifier.
	 * @return int Existing page ID, or zero.
	 */
	private function existing_page( string $id, string $document ): int {
		$posts = $this->matching_pages( $id, $document );
		foreach ( $posts as $post_id ) {
			if ( 'draft' === get_post_status( $post_id ) ) {
				return (int) $post_id; }
		}
		return 0;
	}

	/** Find every page carrying this exact template/document identity.
	 *
	 * @param string $id Template identifier.
	 * @param string $document Document identifier.
	 * @return list<int>
	 */
	private function matching_pages( string $id, string $document ): array {
		$posts = get_posts(
			[
				'post_type'   => 'page',
				'post_status' => [ 'draft', 'private', 'publish', 'pending', 'future', 'trash' ],
				'numberposts' => -1,
				'fields'      => 'ids',
				'meta_key'    => '_blixis_template_import',
				'meta_value'  => $id,
			]
		);
		$out   = [];
		foreach ( $posts as $post_id ) {
			if ( get_post_meta( $post_id, '_blixis_template_document', true ) === $document ) {
				$out[] = (int) $post_id; }
		}
		return $out;
	}

	/** Sideload only files named by the validated pack manifest.
	 *
	 * @param string              $root Pack directory.
	 * @param array<string,mixed> $assets Validated asset manifest.
	 * @param int[]               $created Newly created attachment IDs, by reference.
	 * @return array<string,string> Stable renderer references keyed by pack asset ID.
	 * @throws \RuntimeException When a pack path or sideload operation fails.
	 */
	private function sideload_assets( string $root, array $assets, array &$created ): array {
		$out = [];
		foreach ( $assets as $reference => $asset ) {
			if ( ! is_array( $asset ) || 'template-path' !== ( $asset['source']['type'] ?? '' ) ) {
				continue;
			}
			$relative = (string) $asset['source']['path'];
			$path     = realpath( $root . '/' . $relative );
			$base     = realpath( $root );
			if ( false === $path || false === $base || ! str_starts_with( $path, $base . DIRECTORY_SEPARATOR ) || ! is_file( $path ) ) {
				throw new \RuntimeException( 'Invalid bundled asset path.' );
			}
			$key       = hash( 'sha256', basename( $root ) . ':' . $relative );
			$asset_ref = basename( $root ) . '_' . $reference;
			$found     = get_posts(
				[
					'post_type'   => 'attachment',
					'post_status' => 'inherit',
					'numberposts' => 1,
					'fields'      => 'ids',
					'meta_key'    => self::ASSET_META,
					'meta_value'  => $key,
				]
			);
			if ( $found ) {
				$out[ $reference ] = $asset_ref;
				continue;
			}
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			$tmp = wp_tempnam( basename( $path ) );
			if ( ! $tmp || ! copy( $path, $tmp ) ) {
				throw new \RuntimeException( 'Bundled asset could not be staged.' );
			}
			$svg_mimes = static function ( array $mimes ): array {
				$mimes['svg'] = 'image/svg+xml';
				return $mimes;
			};
			add_filter( 'upload_mimes', $svg_mimes );
			try {
				$id = media_handle_sideload(
					[
						'name'     => basename( $path ),
						'tmp_name' => $tmp,
					],
					0,
					sanitize_text_field( $asset['alt'] ?? $reference )
				);
			} finally {
				remove_filter( 'upload_mimes', $svg_mimes );
			}
			if ( is_wp_error( $id ) ) {
				wp_delete_file( $tmp );
				throw new \RuntimeException( 'Bundled asset could not be imported.' );
			}
			$created[] = (int) $id;
			$alt       = sanitize_text_field( $asset['alt'] ?? $reference );
			if ( ! add_post_meta( $id, self::ASSET_META, $key, true ) || ! add_post_meta( $id, self::ASSET_REF_META, $asset_ref, true ) ) {
				throw new \RuntimeException( 'Bundled asset identity could not be saved.' );
			}
			update_post_meta( $id, '_wp_attachment_image_alt', $alt );
			$out[ $reference ] = $asset_ref;
		}
		return $out;
	}
	/** Replace each pack-local asset reference with its namespaced imported reference.
	 *
	 * @param array<string,mixed>  $node Element node.
	 * @param array<string,string> $assets Imported references.
	 * @return array<string,mixed>
	 */
	private function resolve_assets( array $node, array $assets ): array {
		if ( isset( $node['props']['assetRef'], $assets[ $node['props']['assetRef'] ] ) ) {
			$node['props']['assetRef'] = $assets[ $node['props']['assetRef'] ];
		}
		foreach ( $node['children'] ?? [] as $i => $child ) {
			$node['children'][ $i ] = $this->resolve_assets( $child, $assets );
		}
		return $node;
	}
	/** Flatten an element tree for localization and navigation scans.
	 *
	 * @param array<string,mixed> $root Root node.
	 * @return list<array<string,mixed>>
	 */
	private function tree_nodes( array $root ): array {
		$out = [ $root ];
		foreach ( $root['children'] ?? [] as $child ) {
			$out = array_merge( $out, $this->tree_nodes( $child ) );
		}
		return $out;
	}
	/** Move definition-localizable properties into locale stream entries and normalize pack rich text.
	 *
	 * @param array<string,mixed>       $root Document root.
	 * @param ElementDefinitionRegistry $definitions Definition registry.
	 * @param string[]                  $notes Import notes, updated by reference.
	 * @param array<string,mixed>       $tokens Allowed bundled color tokens.
	 * @return array<string,array{status:string,values:object}> Entries keyed by element id.
	 */
	public static function extract_localizable( array &$root, ElementDefinitionRegistry $definitions, array &$notes = [], array $tokens = [] ): array {
		$entries = [];
		$stack   = [ [] ];
		while ( [] !== $stack ) {
			$path = array_pop( $stack );
			$node =& $root;
			foreach ( $path as $index ) {
				if ( ! isset( $node['children'][ $index ] ) || ! is_array( $node['children'][ $index ] ) ) {
					continue 2;
				}
				$node =& $node['children'][ $index ];
			}
			$type   = is_string( $node['type'] ?? null ) ? $node['type'] : '';
			$id     = is_string( $node['id'] ?? null ) ? $node['id'] : '';
			$props  = is_array( $node['props'] ?? null ) ? $node['props'] : [];
			$values = [];
			foreach ( $props as $name => $value ) {
				$spec = $definitions->property( str_starts_with( $type, 'blixis/' ) ? $type : 'blixis/' . $type, (string) $name );
				if ( ! is_array( $spec ) || true !== ( $spec['localizable'] ?? false ) ) {
					continue;
				}
				$converted = self::convert_template_value( $value, $spec, $tokens, $notes, (string) $name );
				if ( null !== $converted ) {
					$values[ $definitions->canonical_property( $type, (string) $name ) ] = $converted;
				}
				unset( $node['props'][ $name ] );
			}
			if ( $values && '' !== $id ) {
				$entries[ $id ] = [
					'status' => 'draft',
					'values' => (object) $values,
				];
			}
			if ( is_array( $node['children'] ?? null ) ) {
				foreach ( array_keys( $node['children'] ) as $index ) {
					$child_path   = $path;
					$child_path[] = $index;
					$stack[]      = $child_path;
				}
			}
			unset( $node );
		}
		return $entries;
	}

	/** Build the exact default-locale layout and content envelopes for one imported page.
	 *
	 * @param array<string,mixed>       $root Template root, updated with only invariant/layout properties.
	 * @param ElementDefinitionRegistry $definitions Definition registry.
	 * @param string                    $locale Default content locale.
	 * @param string[]                  $notes Import notes, updated by reference.
	 * @param array<string,mixed>       $tokens Allowed bundled color tokens.
	 * @return array{layout:array<string,mixed>,content:array<string,mixed>}
	 */
	public static function document_streams( array &$root, ElementDefinitionRegistry $definitions, string $locale, array &$notes, array $tokens = [] ): array {
		$entries = self::extract_localizable( $root, $definitions, $notes, $tokens );
		return [
			'layout'  => [
				'schemaVersion'  => 1,
				'layoutRevision' => 1,
				'defaultLocale'  => $locale,
				'root'           => [ $root ],
			],
			'content' => [
				'schemaVersion'   => 1,
				'contentRevision' => 1,
				'locale'          => $locale,
				'entries'         => (object) $entries,
			],
		];
	}

	/** Convert the template pack's span format to the versioned safe inline text model.
	 *
	 * @param mixed               $value Template property value.
	 * @param array<string,mixed> $spec Property definition.
	 * @param array<string,mixed> $tokens Allowed color tokens.
	 * @param string[]            $notes Import notes, updated by reference.
	 * @param string              $property_name Canonical property name.
	 * @return mixed|null Safe localized value, or null when rejected.
	 */
	public static function convert_template_value( mixed $value, array $spec, array $tokens, array &$notes, string $property_name = '' ): mixed {
		if ( 'items' === $property_name && 'array<object>' === ( $spec['type'] ?? null ) ) {
			$items = self::safe_navigation_items( $value, $notes );
			return null === $items ? null : $items;
		}
		if ( 'alt' === $property_name && is_array( $value ) && array_is_list( $value ) ) {
			$text = '';
			foreach ( array_slice( $value, 0, 5000 ) as $part ) {
				if ( ! is_array( $part ) || ! is_string( $part['text'] ?? null ) || 1 !== preg_match( '//u', $part['text'] ) || 1 === preg_match( '/[\x00-\x1F\x7F-\x9F<>]/u', $part['text'] ) ) {
					$notes[] = 'Dropped invalid alternative text part.';
					continue;
				}
				$text .= $part['text'];
				if ( isset( $part['marks'] ) && [] !== $part['marks'] ) {
					$notes[] = 'Dropped formatting from alternative text.';
				}
			}
			if ( strlen( $text ) > 20000 ) {
				$notes[] = 'Dropped oversized alternative text.';
				return null;
			}
			return $text;
		}
		if ( is_string( $value ) ) {
			return strlen( $value ) <= 20000 ? $value : null;
		}
		if ( ! is_array( $value ) || ! array_is_list( $value ) || ! in_array( $spec['type'] ?? '', [ 'string', 'rich-text' ], true ) ) {
			$notes[] = 'Dropped unsupported localized value.';
			return null;
		}
		$inline = [];
		$total  = 0;
		if ( count( $value ) > 5000 ) {
			$notes[] = 'Truncated oversized rich-text value.';
		}
		foreach ( array_slice( $value, 0, 5000 ) as $part ) {
			if ( ! is_array( $part ) || ! is_string( $part['text'] ?? null ) ) {
				$notes[] = 'Dropped malformed rich-text part.';
				continue;
			}
			$text = $part['text'];
			if ( 1 !== preg_match( '//u', $text ) || 1 === preg_match( '/[\x00-\x1F\x7F-\x9F]/u', $text ) ) {
				$notes[] = 'Dropped invalid rich-text text.';
				continue;
			}
			$total += strlen( $text );
			if ( $total > 20000 ) {
				$notes[] = 'Truncated oversized rich-text value.';
				break;
			}
			if ( '' === $text ) {
				continue;
			}
			$marks      = [];
			$part_marks = is_array( $part['marks'] ?? null ) ? $part['marks'] : [];
			if ( count( $part_marks ) > 8 ) {
				$notes[] = 'Dropped rich-text marks beyond the limit.';
			}
			foreach ( array_slice( $part_marks, 0, 8 ) as $mark ) {
				if ( ! is_array( $mark ) || ! is_string( $mark['type'] ?? null ) ) {
					$notes[] = 'Dropped unsupported rich-text mark.';
					continue;
				}
				if ( in_array( $mark['type'], [ 'strong', 'em', 'u', 's', 'code' ], true ) ) {
					$marks[] = $mark['type'];
				} elseif ( 'token-color' === $mark['type'] && is_string( $mark['value'] ?? null ) && array_key_exists( $mark['value'], $tokens ) && 1 === preg_match( '/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/D', $mark['value'] ) ) {
					$marks[] = [ 'style' => [ 'color' => $mark['value'] ] ];
				} else {
					$notes[] = 'Dropped unsupported or unknown rich-text mark.';
				}
			}
			$inline[] = [
				't' => 'text',
				's' => $text,
			] + ( $marks ? [ 'm' => $marks ] : [] );
		}
		return [
			'v'      => 1,
			'inline' => $inline,
		];
	}

	/** Filter localized navigation data to supported labels, URLs and bounded child lists.
	 *
	 * @param mixed    $candidate Candidate items.
	 * @param string[] $notes Import notes.
	 * @param int      $depth Current nesting depth.
	 * @return list<array<string,mixed>>|null Safe items.
	 */
	private static function safe_navigation_items( mixed $candidate, array &$notes, int $depth = 0 ): ?array {
		if ( ! is_array( $candidate ) || ! array_is_list( $candidate ) || $depth > 8 || count( $candidate ) > 100 ) {
			$notes[] = 'Dropped invalid navigation items.';
			return null;
		}
		$out = [];
		foreach ( $candidate as $item ) {
			if ( ! is_array( $item ) || ! is_string( $item['label'] ?? null ) || strlen( $item['label'] ) > 300 || 1 !== preg_match( '//u', $item['label'] ) || 1 === preg_match( '/[\x00-\x1F\x7F-\x9F<>]/u', $item['label'] ) ) {
				$notes[] = 'Dropped invalid navigation label.';
				continue;
			}
			if ( [] !== array_diff( array_keys( $item ), [ 'label', 'href', 'link', 'current', 'children' ] ) ) {
				$notes[] = 'Dropped unsupported navigation item properties.';
			}
			$entry = [ 'label' => $item['label'] ];
			$href  = $item['href'] ?? $item['link'] ?? null;
			if ( is_string( $href ) && \Blixis\Builder\Registry\SafeUrl::accepts( $href ) ) {
				$entry['href'] = $href;
			} else {
				$notes[] = 'Dropped invalid navigation URL.';
			}
			if ( true === ( $item['current'] ?? false ) ) {
				$entry['current'] = true;
			}
			if ( isset( $item['children'] ) ) {
				$children = self::safe_navigation_items( $item['children'], $notes, $depth + 1 );
				if ( null !== $children ) {
					$entry['children'] = $children;
				}
			}
			$out[] = $entry;
		}
		return $out;
	}

	/** Index element types for localized properties in a validated template tree.
	 *
	 * @param array<string,mixed> $root Root.
	 * @return array<string,string> Element id to type.
	 */
	private function tree_types( array $root ): array {
		$types = [];
		foreach ( $this->tree_nodes( $root ) as $node ) {
			if ( is_string( $node['id'] ?? null ) && is_string( $node['type'] ?? null ) ) {
				$types[ $node['id'] ] = $node['type'];
			}
		}
		return $types;
	}
	/** Create the first navigation menu described by the template.
	 *
	 * @param string                    $id Template identifier.
	 * @param list<array<string,mixed>> $documents Template documents.
	 * @param int[]                     $created Newly created menu IDs, by reference.
	 * @throws \RuntimeException When menu creation or item insertion fails.
	 */
	private function create_navigation( string $id, array $documents, array &$created ): void {
		foreach ( $documents as $document ) {
			foreach ( $this->tree_nodes( $document['root'] ) as $node ) {
				if ( 'navigation' !== $node['type'] || empty( $node['props']['items'] ) ) {
					continue;
				}
				$menu_id = wp_create_nav_menu( sanitize_text_field( $id . ' navigation' ) );
				if ( is_wp_error( $menu_id ) ) {
					throw new \RuntimeException( 'Template navigation could not be created.' );
				}
				$created[] = (int) $menu_id;
				foreach ( $node['props']['items'] as $item ) {
					$item_id = wp_update_nav_menu_item(
						$menu_id,
						0,
						[
							'menu-item-title'  => sanitize_text_field( $item['label'] ?? '' ),
							'menu-item-url'    => esc_url_raw( $item['href'] ?? '' ),
							'menu-item-status' => 'publish',
						]
					);
					if ( is_wp_error( $item_id ) || ! $item_id ) {
						throw new \RuntimeException( 'Template navigation item could not be created.' );
					}
				}
				return;
			}
		}
	}
}
