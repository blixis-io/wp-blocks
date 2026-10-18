<?php
/**
 * Pure validation for bundled template data.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

use Blixis\Builder\Registry\ElementDefinitionRegistry;

/** Rejects unsafe or structurally unsupported template packs before they reach clients. */
final class TemplateValidator {
	private const FONTS    = [ 'Plus Jakarta Sans', 'Inter', 'Space Grotesk', 'DM Sans', 'Manrope', 'Outfit' ];
	private const MAX_JSON = 2_000_000;
	/** Nodes visited in the current document.
	 *
	 * @var int
	 */
	private int $node_count = 0;
	/** Element ids seen in the current document.
	 *
	 * @var array<string,true>
	 */
	private array $node_ids = [];
	/**
	 * Cached generated element registry.
	 *
	 * @var ElementDefinitionRegistry|null
	 */
	private static ?ElementDefinitionRegistry $registry = null;

	/** Validate a pack directory.
	 *
	 * @param string $directory Pack root.
	 * @return list<string> Validation errors.
	 */
	public function validate( string $directory ): array {
		try {
			return $this->validate_pack( $directory );
		} catch ( \Throwable $error ) {
			return [ 'template structure is malformed' ];
		}
	}
	/** Report registry/property mismatches that keep otherwise safe documents from import.
	 *
	 * @param string $directory Template pack root.
	 * @return list<string> Reasons.
	 */
	public function importability_reasons( string $directory ): array {
		$file = $directory . '/template.json';
		$data = is_file( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local bundled pack.
		if ( ! is_array( $data ) || ! is_array( $data['documents'] ?? null ) ) {
			return [ 'Template document data is malformed.' ];
		}
		$reasons = [];
		foreach ( $data['documents'] as $document ) {
			$errors           = [];
			$this->node_count = 0;
			$this->node_ids   = [];
			$this->node( $document['root'] ?? [], '$.root', $errors, $data['assets'] ?? [], $reasons, self::registry() );
		}
		$reasons = array_values( array_unique( $reasons ) );
		sort( $reasons );
		return $reasons;
	}
	/** Validate the pack JSON, assets, tokens and documents.
	 *
	 * @param string $directory Pack root.
	 * @return list<string> Validation errors.
	 */
	private function validate_pack( string $directory ): array {
		$registry = self::registry();
		$file     = $directory . '/template.json';
		if ( ! is_file( $file ) || filesize( $file ) > self::MAX_JSON ) {
			return [ 'template.json missing or exceeds size limit' ]; }
		$data = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read a local bundled JSON file.
		if ( ! is_array( $data ) ) {
			return [ 'template.json is not a JSON object' ]; }
		$errors = [];
		$this->keys( $data, [ 'schemaVersion','template','dependencies','fonts','designTokens','assets','documents','localizations','importOptions','security','dataBindings' ], '$', $errors );
		if ( ( $data['schemaVersion'] ?? null ) !== '1.0.0' ) {
			$errors[] = '$.schemaVersion must be 1.0.0'; }
		$template = $data['template'] ?? [];
		if ( ! is_array( $template ) ) {
			$errors[] = '$.template must be an object';
			$template = []; }
		$this->keys( $template, [ 'id','slug','name','category','description','version','requiredBuilderVersion','license','tags','previewImageRef','defaultLocale','supportedLocales' ], '$.template', $errors );
		$this->keys( $data['dependencies'] ?? [], [ 'wordpressPlugins','fontProvider' ], '$.dependencies', $errors );
		foreach ( $data['dependencies']['wordpressPlugins'] ?? [] as $plugin_index => $plugin ) {
			if ( ! is_array( $plugin ) ) {
				$errors[] = "$.dependencies.wordpressPlugins[$plugin_index] must be an object";
				continue; }
			$this->keys( $plugin, [ 'slug','required' ], "$.dependencies.wordpressPlugins[$plugin_index]", $errors );
		}
		foreach ( [ 'id', 'slug' ] as $field ) {
			if ( ! is_string( $template[ $field ] ?? null ) || ! preg_match( '/^[a-z0-9-]{1,64}$/D', $template[ $field ] ) ) {
				$errors[] = "$.template.$field is invalid"; }
		}
		if ( ! is_string( $template['version'] ?? null ) || ! preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/D', $template['version'] ) ) {
			$errors[] = '$.template.version must be semver'; }
		if ( ! is_string( $template['requiredBuilderVersion'] ?? null ) || ! preg_match( '/^(?:>=|\^|~)?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/D', $template['requiredBuilderVersion'] ) ) {
			$errors[] = '$.template.requiredBuilderVersion is invalid'; }
		if ( ! is_string( $template['name'] ?? null ) || strlen( $template['name'] ) > 100 ) {
			$errors[] = '$.template.name exceeds 100 characters'; }
		if ( ! is_string( $template['description'] ?? null ) || strlen( $template['description'] ) > 500 ) {
			$errors[] = '$.template.description exceeds 500 characters'; }
		foreach ( [
			'name'        => 100,
			'description' => 500,
			'license'     => 80,
			'category'    => 64,
		] as $field => $max ) {
			$value = $template[ $field ] ?? null;
			if ( ! is_string( $value ) || strlen( $value ) < ( 'description' === $field ? 0 : 1 ) || strlen( $value ) > $max || preg_match( '/[<>]/', $value ) ) {
				$errors[] = "$.template.$field must be bounded plain text"; }
		}
		if ( ! in_array( $template['category'] ?? null, [ 'corporate','agency','real-estate','ecommerce','blog','portfolio','saas','other' ], true ) ) {
			$errors[] = '$.template.category is invalid'; }
		if ( ! is_array( $template['tags'] ?? null ) || ! array_is_list( $template['tags'] ) ) {
			$errors[] = '$.template.tags must be a list'; }
		if ( ! is_string( $template['license'] ?? null ) || strlen( $template['license'] ) < 1 || strlen( $template['license'] ) > 80 ) {
			$errors[] = '$.template.license is invalid'; }
		foreach ( is_array( $template['tags'] ?? null ) ? $template['tags'] : [] as $i => $tag ) {
			if ( ! is_string( $tag ) || ! preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $tag ) ) {
				$errors[] = "$.template.tags[$i] is invalid"; }
		}
		$security = $data['security'] ?? [];
		if ( ! is_array( $security ) || ( $security['allowRemoteScripts'] ?? true ) !== false || ( $security['allowEmbeddedHtml'] ?? true ) !== false ) {
			$errors[] = '$.security must disable remote scripts and embedded HTML'; }
		$locales = $template['supportedLocales'] ?? [];
		if ( ! is_array( $locales ) ) {
			$errors[] = '$.template.supportedLocales must be a list';
			$locales  = []; }
		if ( ! in_array( $template['defaultLocale'] ?? null, $locales, true ) ) {
			$errors[] = '$.template.defaultLocale must be supported'; }
		foreach ( $locales as $locale ) {
			if ( ! is_string( $locale ) || ! preg_match( '/^[a-z]{2}(?:-[A-Z]{2})?$/D', $locale ) ) {
				$errors[] = '$.template.supportedLocales contains an invalid locale'; }
		}
		foreach ( array_keys( $data['localizations'] ?? [] ) as $locale ) {
			if ( ! in_array( $locale, $locales, true ) ) {
				$errors[] = "$.localizations.$locale is not a declared locale"; }
		}
		$this->inspect_tree( $data['localizations'] ?? [], '$.localizations', $errors );
		foreach ( $data['importOptions'] ?? [] as $key => $value ) {
			if ( ! is_bool( $value ) || ( 'downloadAssets' === $key && true === $value ) ) {
				$errors[] = "$.importOptions.$key must be a boolean and bundled downloads must be disabled"; }
		}
		$font_ids = [];
		foreach ( $data['fonts'] ?? [] as $i => $font ) {
			if ( ! is_array( $font ) ) {
				$errors[] = "$.fonts[$i] must be an object";
				continue;
			} $this->keys( $font, [ 'id','provider','family','weights','styles' ], "$.fonts[$i]", $errors );
			if ( ! is_string( $font['id'] ?? null ) || ! preg_match( '/^[a-z0-9-]{1,64}$/D', $font['id'] ) || in_array( $font['id'], $font_ids, true ) ) {
				$errors[] = "$.fonts[$i].id is invalid or duplicated"; }
			$font_ids[] = $font['id'] ?? '';
			if ( ( $font['provider'] ?? null ) !== 'google' ) {
				$errors[] = "$.fonts[$i].provider is unsupported"; }
			if ( ! in_array( $font['family'] ?? null, self::FONTS, true ) ) {
				$errors[] = "$.fonts[$i].family is not bundled";
			} foreach ( $font['weights'] ?? [] as $weight ) {
				if ( ! is_int( $weight ) || $weight < 100 || $weight > 900 || 0 !== $weight % 100 ) {
					$errors[] = "$.fonts[$i] has invalid weight"; }
			}
			foreach ( $font['styles'] ?? [] as $style ) {
				if ( ! in_array( $style, [ 'normal','italic' ], true ) ) {
					$errors[] = "$.fonts[$i] has invalid style"; }
			}
		}
		$this->keys( $data['importOptions'] ?? [], [ 'createPages','setHomePage','downloadAssets','createNavigation','overwriteExisting' ], '$.importOptions', $errors );
		$tokens = $data['designTokens'] ?? [];
		$this->keys( $tokens, [ 'colors','typography','spacing','radii','layout','breakpoints','defaultAppearance' ], '$.designTokens', $errors );
		foreach ( [
			'colors'      => [ 'light', 'dark' ],
			'typography'  => [ 'headingFontRef', 'bodyFontRef', 'scale' ],
			'spacing'     => [ 'sm', 'md', 'lg', 'xl', 'section' ],
			'radii'       => [ 'sm', 'md', 'lg', 'pill' ],
			'layout'      => [ 'container' ],
			'breakpoints' => [ 'mobileMax', 'tabletMax' ],
		] as $group => $allowed ) {
			if ( is_array( $tokens[ $group ] ?? null ) ) {
				$this->keys( $tokens[ $group ], $allowed, "$.designTokens.$group", $errors ); }
		}
		if ( is_array( $tokens['colors'] ?? null ) ) {
			foreach ( $tokens['colors'] as $mode => $palette ) {
				if ( is_array( $palette ) ) {
					$this->keys( $palette, [ 'primary','secondary','accent','background','surface','text','muted','border' ], "$.designTokens.colors.$mode", $errors ); }
			}
		}
		if ( is_array( $tokens['typography']['scale'] ?? null ) ) {
			$this->keys( $tokens['typography']['scale'], [ 'h1','h2','body' ], '$.designTokens.typography.scale', $errors ); }
		foreach ( [ 'headingFontRef', 'bodyFontRef' ] as $font_ref ) {
			if ( ! in_array( $tokens['typography'][ $font_ref ] ?? null, $font_ids, true ) ) {
				$errors[] = "$.designTokens.typography.$font_ref must reference a declared font"; }
		}
		$this->tokens( $data['designTokens'] ?? [], '$.designTokens', $errors );
		foreach ( $data['assets'] ?? [] as $name => $asset ) {
			$this->inspect_tree( $asset, "$.assets.$name", $errors );
			if ( ! is_array( $asset ) ) {
				$errors[] = "$.assets.$name must be an object";
				continue; }
			$path = $asset['source']['path'] ?? null;
			$this->keys( $asset, [ 'kind','source','alt','attribution' ], "$.assets.$name", $errors );
			if ( ! in_array( $asset['kind'] ?? null, [ 'svg', 'image' ], true ) || ! is_string( $asset['alt'] ?? null ) || strlen( $asset['alt'] ) > 250 ) {
				$errors[] = "$.assets.$name has invalid kind or alt"; }
			if ( ! is_array( $asset['source'] ?? null ) ) {
				$errors[] = "$.assets.$name.source must be an object";
				continue; }
			$this->keys( $asset['source'], [ 'type','path' ], "$.assets.$name.source", $errors );
			if ( ( $asset['source']['type'] ?? null ) !== 'template-path' ) {
				$errors[] = "$.assets.$name.source.type is invalid"; }
			if ( isset( $asset['attribution'] ) ) {
				$this->keys( $asset['attribution'], [ 'required','status','creator','license' ], "$.assets.$name.attribution", $errors );
				if ( ( $asset['attribution']['status'] ?? '' ) !== 'generated' || ( $asset['attribution']['required'] ?? true ) !== false ) {
					$errors[] = "$.assets.$name attribution must identify generated work"; }
			}
			if ( ! is_string( $path ) || str_contains( $path, '..' ) || str_contains( $path, '//' ) || str_starts_with( $path, '/' ) || preg_match( '/^[a-z][a-z0-9+.-]*:/i', $path ) || str_contains( $path, '\\' ) || preg_match( '/[?#\x00-\x20]/', $path ) || ! preg_match( '/\.(svg|webp|png|jpe?g)$/i', $path ) ) {
				$errors[] = "$.assets.$name has unsafe path";
				continue; }
			$real = realpath( $directory . '/' . $path );
			$base = realpath( $directory );
			if ( false === $real || false === $base || ! str_starts_with( $real, $base . DIRECTORY_SEPARATOR ) ) {
				$errors[] = "$.assets.$name is missing or escapes pack";
				continue; }
			if ( filesize( $real ) > 5_000_000 ) {
				$errors[] = "$.assets.$name exceeds size cap"; }
			if ( str_ends_with( strtolower( $path ), '.svg' ) && ! $this->safe_svg( (string) file_get_contents( $real ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read a local bundled SVG.
				$errors[] = "$.assets.$name contains unsafe SVG"; }
		}
		if ( ! isset( $data['assets'][ $template['previewImageRef'] ?? '' ] ) ) {
			$errors[] = '$.template.previewImageRef must name an asset'; }
		foreach ( $data['documents'] ?? [] as $i => $document ) {
			if ( ! is_array( $document ) ) {
				$errors[] = "$.documents[$i] must be an object";
				continue; }
			$this->keys( $document, [ 'id','type','slug','title','status','root','importable','importabilityReasons' ], "$.documents[$i]", $errors );
			foreach ( [
				'title' => 150,
				'slug'  => 64,
				'id'    => 64,
			] as $field => $max ) {
				$value = $document[ $field ] ?? null;
				if ( ! is_string( $value ) || strlen( $value ) < 1 || strlen( $value ) > $max || preg_match( '/[<>]/', $value ) ) {
					$errors[] = "$.documents[$i].$field must be bounded plain text"; }
			}
			if ( ( $document['type'] ?? null ) !== 'page' || ! in_array( $document['status'] ?? null, [ 'draft','publish' ], true ) ) {
				$errors[] = "$.documents[$i] has invalid type or status"; }
			$unsupported      = [];
			$this->node_count = 0;
			$this->node_ids   = [];
			$this->node( $document['root'] ?? [], "$.documents[$i].root", $errors, $data['assets'] ?? [], $unsupported, $registry );
			$reasons = array_values( array_unique( $unsupported ) );
			sort( $reasons );
			if ( $reasons && ( ( $document['importable'] ?? true ) !== false || ( $document['importabilityReasons'] ?? [] ) !== $reasons ) ) {
				$errors[] = "$.documents[$i] importability metadata does not explain registry mismatches"; }
		}
		return array_values( array_unique( $errors ) );
	}
	/** Inspect all nested scalar strings for markup, bounds, and URL-like values.
	 *
	 * @param mixed    $value Nested value.
	 * @param string   $path JSON path.
	 * @param string[] $errors Errors to append.
	 */
	private function inspect_tree( mixed $value, string $path, array &$errors ): void {
		if ( is_array( $value ) ) {
			foreach ( $value as $key => $child ) {
				$this->inspect_tree( $child, "$path.$key", $errors ); }
		} elseif ( is_string( $value ) ) {
			if ( strlen( $value ) > 10000 || preg_match( '/[<>]/', $value ) ) {
				$errors[] = "$path contains invalid plain text"; }
			if ( preg_match( '~^(?:https?:|//|javascript:|data:)~i', trim( $value ) ) && ! \Blixis\Builder\Registry\SafeUrl::accepts( $value ) ) {
				$errors[] = "$path is unsafe URL"; }
		}
	}
	/** Validate nested style states and conservative CSS scalar values.
	 *
	 * @param array<string,mixed> $styles Style data.
	 * @param string              $path JSON path.
	 * @param string[]            $errors Errors to append.
	 */
	private function inspect_styles( array $styles, string $path, array &$errors ): void {
		foreach ( $styles as $key => $value ) {
			if ( ! is_string( $key ) || ! preg_match( '/^[a-zA-Z-]{1,40}$/D', $key ) ) {
				$errors[] = "$path has an invalid key";
				continue; }
			if ( is_array( $value ) ) {
				$this->inspect_styles( $value, "$path.$key", $errors );
				continue; }
			if ( ! is_string( $value ) || strlen( $value ) > 200 || preg_match( '/url\\s*\\(|expression|@import|javascript:/i', $value ) || ! preg_match( '/^(?:#[A-Fa-f0-9]{3,8}|-?[0-9.]+(?:px|rem|em|vw|vh|ch|%)|var\\(--bx-[a-z0-9-]+\\)|[A-Za-z-]+|[0-9.]+)$/D', trim( $value ) ) ) {
				$errors[] = "$path.$key is unsafe"; }
		}
	}
	/** Parse SVG as XML and allow only inert vector elements and attributes.
	 *
	 * @param string $svg SVG markup.
	 * @return bool Whether markup is within the inert vector allowlist.
	 */
	private function safe_svg( string $svg ): bool {
		if ( preg_match( "~<!DOCTYPE|<!ENTITY|<style\\b|<script\\b|<foreignObject\\b|<animate\\b|<set\\b|<image\\b|&#|javascript:~i", $svg ) ) {
			return false; }
		if ( ! class_exists( \DOMDocument::class ) ) {
			$allowed = [ 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'text', 'tspan', 'use' ];
			preg_match_all( '~<(/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>~', $svg, $matches, PREG_SET_ORDER );
			$plain_text = preg_replace( '~<(/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>~', '', $svg );
			if ( ! $matches || 'svg' !== strtolower( $matches[0][2] ) || null === $plain_text || preg_match( '/[<&]/', $plain_text ) ) {
				return false; }
			$stack = [];
			foreach ( $matches as $tag ) {
				if ( ! in_array( $tag[2], $allowed, true ) || str_starts_with( $tag[3], '!' ) || str_starts_with( $tag[3], '?' ) ) {
					return false; }
				if ( '' !== $tag[1] ) {
					if ( array_pop( $stack ) !== $tag[2] ) {
						return false; }
					continue; }
				$tail  = (string) preg_replace( '/\\s+/', ' ', trim( rtrim( $tag[3], '/' ) ) );
				$attrs = [ 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'viewBox', 'xmlns', 'id', 'class', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-path', 'mask', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'role', 'aria-label', 'xmlns:xlink', 'href', 'xlink:href' ];
				preg_match_all( "~([A-Za-z_:][A-Za-z0-9_.:-]*)\\s*=\\s*([\"\'])(.*?)\\2~s", $tail, $am, PREG_SET_ORDER );
				$consumed = preg_replace( "~([A-Za-z_:][A-Za-z0-9_.:-]*)\\s*=\\s*([\"\'])(.*?)\\2~s", '', $tail );
				if ( trim( (string) $consumed ) !== '' ) {
					return false; }
				$self_closing = str_ends_with( trim( $tag[3] ), '/' );
				if ( ! $self_closing ) {
					$stack[] = $tag[2]; }
				foreach ( $am as $attr ) {
					$name  = $attr[1];
					$value = $attr[3];
					if ( ! in_array( $name, $attrs, true ) || str_starts_with( strtolower( $name ), 'on' ) || ( in_array( $name, [ 'href','xlink:href' ], true ) && ! preg_match( '/^#[A-Za-z_][A-Za-z0-9_.:-]*$/D', $value ) ) || ( ! in_array( $name, [ 'xmlns','xmlns:xlink' ], true ) && preg_match( '~(?:https?://|//|data:)~i', $value ) ) ) {
						return false; }
				}
			}
			return [] === $stack;
		}
		$dom      = new \DOMDocument();
		$previous = libxml_use_internal_errors( true );
		$ok       = $dom->loadXML( $svg, LIBXML_NONET | LIBXML_NOBLANKS );
		libxml_clear_errors();
		libxml_use_internal_errors( $previous );
		$root = $dom->documentElement; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOMDocument property name.
		if ( ! $ok || ! $root || 'svg' !== $root->localName ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOMElement property name.
			return false; }
		$elements = [ 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'text', 'tspan', 'use' ];
		$attrs    = [ 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'viewBox', 'xmlns', 'id', 'class', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-path', 'mask', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'role', 'aria-label', 'xmlns:xlink', 'href', 'xlink:href' ];
		foreach ( $dom->getElementsByTagName( '*' ) as $element ) {
			if ( ! in_array( $element->localName, $elements, true ) ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOMElement property name.
				return false; }
			foreach ( $element->attributes as $attribute ) {
				$name  = $attribute->nodeName; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOMAttr property name.
				$value = $attribute->nodeValue ?? ''; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOMAttr property name.
				if ( ! in_array( $name, $attrs, true ) || str_starts_with( strtolower( $name ), 'on' ) || ( in_array( $name, [ 'href','xlink:href' ], true ) && ! preg_match( '/^#[A-Za-z_][A-Za-z0-9_.:-]*$/D', $value ) ) || ( ! in_array( $name, [ 'xmlns','xmlns:xlink' ], true ) && preg_match( '~(?:https?://|//|data:)~i', $value ) ) ) {
					return false; }
			}
		}
		return true;
	}

	/** Reject unknown object keys.
	 *
	 * @param array<string,mixed> $data Object to inspect.
	 * @param string[]            $allowed Allowed keys.
	 * @param string              $path JSON path.
	 * @param string[]            $errors Errors to append.
	 */
	private function keys( array $data, array $allowed, string $path, array &$errors ): void {
		foreach ( array_keys( $data ) as $key ) {
			if ( ! in_array( $key, $allowed, true ) ) {
				$errors[] = "$path.$key is unknown"; }
		} }
	/** Validate token values.
	 *
	 * @param mixed    $value Token value.
	 * @param string   $path JSON path.
	 * @param string[] $errors Errors to append.
	 */
	private function tokens( mixed $value, string $path, array &$errors ): void {
		if ( ! is_array( $value ) ) {
			$errors[] = "$path must be an object";
			return; }
		foreach ( $value as $key => $entry ) {
			$next = "$path.$key";
			if ( is_array( $entry ) ) {
				$this->tokens( $entry, $next, $errors );
				continue; }
			if ( str_contains( (string) $key, 'color' ) || in_array( $key, [ 'primary','secondary','accent','background','surface','text','muted','border' ], true ) ) {
				if ( is_string( $entry ) && ! preg_match( '/^#[0-9a-f]{6}$/iD', $entry ) ) {
					$errors[] = "$next must be #RRGGBB"; }
			} elseif ( is_string( $entry ) && ! preg_match( '/^(?:-?[0-9.]+(?:px|rem|em|vw|vh|ch|%)|clamp\(-?[0-9.]+(?:px|rem|em|vw|vh|ch|%),\s*-?[0-9.]+(?:px|rem|em|vw|vh|ch|%),\s*-?[0-9.]+(?:px|rem|em|vw|vh|ch|%)\))$/D', $entry ) && ! in_array( $entry, [ 'auto','light','dark','heading','body' ], true ) ) {
				$errors[] = "$next has invalid CSS length/value"; }
		}
	}
	/** Validate a document node recursively.
	 *
	 * @param mixed                     $node Node data.
	 * @param string                    $path JSON path.
	 * @param string[]                  $errors Errors to append.
	 * @param array<string,mixed>       $assets Pack assets.
	 * @param array<int|string,mixed>   $unsupported Registry mismatches to append.
	 * @param ElementDefinitionRegistry $registry Generated definitions.
	 */
	private function node( mixed $node, string $path, array &$errors, array $assets, array &$unsupported, ElementDefinitionRegistry $registry ): void {
		$depth = substr_count( $path, '.children[' ) + 1;
		if ( $depth > 32 || ++$this->node_count > 5000 ) {
			$errors[] = "$path exceeds tree limits";
			return; }
		if ( ! is_array( $node ) ) {
			$errors[] = "$path must be an object";
			return; }
		$this->keys( $node, [ 'id','type','props','children','animations','styles' ], $path, $errors );
		$type    = $node['type'] ?? '';
		$node_id = $node['id'] ?? null;
		if ( ! is_string( $node_id ) || 1 !== preg_match( '/^[a-z0-9][a-z0-9_-]{2,63}$/D', $node_id ) || isset( $this->node_ids[ $node_id ] ) ) {
			$errors[] = "$path.id is invalid or duplicated";
		} elseif ( is_string( $node_id ) ) {
			$this->node_ids[ $node_id ] = true; }
		if ( null === $registry->get( (string) $type ) ) {
			$unsupported[] = "Element type \"$type\" is not available in the core element registry.";
			foreach ( $node['props'] ?? [] as $unsupported_prop => $unused ) {
				$unsupported[] = "Element type \"$type\" has prop \"$unsupported_prop\" with no core schema."; }
		}
		$props = $node['props'] ?? [];
		if ( is_array( $props ) ) {
			foreach ( $props as $key => $value ) {
				$property = null !== $registry->get( (string) $type ) ? $registry->property( (string) $type, (string) $key ) : null;
				if ( null !== $property && ! $this->property_value_valid( $property, $value ) ) {
					$unsupported[] = "Element type \"$type\" prop \"$key\" has a value outside its definition.";
				}
				if ( 'placeholderAssets' === $key && ( ! is_array( $value ) || ! array_is_list( $value ) || array_filter( $value, static fn ( mixed $reference ): bool => ! is_string( $reference ) || ! isset( $assets[ $reference ] ) ) ) ) {
					$unsupported[] = "Element type \"$type\" prop \"$key\" must reference bundled assets.";
				}
				if ( null !== $registry->get( (string) $type ) && null === $property ) {
					$unsupported[] = "Element type \"$type\" uses unsupported prop \"$key\"."; }
				$this->inspect_prop( (string) $key, $value, "$path.props.$key", $errors );
				if ( 'assetRef' === $key && ( ! is_string( $value ) || ! isset( $assets[ $value ] ) ) ) {
					$errors[] = "$path.props.assetRef is unknown"; }
			}
		}
		$this->inspect_tree( $props, "$path.props", $errors );
		$styles = $node['styles'] ?? [];
		if ( ! is_array( $styles ) ) {
			$errors[] = "$path.styles must be an object";
		} else {
			$this->inspect_styles( $styles, "$path.styles", $errors );
		}
		$animations = $node['animations'] ?? [];
		if ( ! is_array( $animations ) || ! array_is_list( $animations ) ) {
			$errors[] = "$path.animations must be an array";
		} else {
			foreach ( $animations as $i => $animation ) {
				if ( ! is_array( $animation ) || array_diff( array_keys( $animation ), [ 'id','preset','trigger','timing','from','to','reducedMotion' ] ) || ! in_array( $animation['preset'] ?? null, [ 'fade-up' ], true ) ) {
					$errors[] = "$path.animations[$i] has unsupported shape";
				}
			}
		}
		$this->inspect_tree( $animations, "$path.animations", $errors );
		foreach ( $node['children'] ?? [] as $i => $child ) {
			$this->node( $child, "$path.children[$i]", $errors, $assets, $unsupported, $registry ); }
	}
	/** Read the repository's element manifest without invoking WordPress.
	 *
	 * @return ElementDefinitionRegistry Generated definitions.
	 */
	private static function registry(): ElementDefinitionRegistry {
		if ( null !== self::$registry ) {
			return self::$registry; }
		self::$registry = ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__, 2 ) . '/data/element-definitions-v2.json' );
		return self::$registry;
	}
	/** Check a property against the definition's declared primitive type and enum.
	 *
	 * @param array<string,mixed> $property Property metadata.
	 * @param mixed               $value Value to validate.
	 */
	private function property_value_valid( array $property, mixed $value ): bool {
		$type = $property['type'] ?? '';
		if ( 'string' === $type && is_array( $value ) && array_is_list( $value ) ) {
			foreach ( $value as $part ) {
				if ( ! is_array( $part ) || ! is_string( $part['text'] ?? null ) || array_diff( array_keys( $part ), [ 'text', 'marks' ] ) ) {
					return false;
				}
			}
			return true;
		}
		if ( 'null' === gettype( $value ) ) {
			return in_array( $type, [ 'asset-ref','media','string' ], true );
		}
		$valid = match ( $type ) {
			'string', 'url', 'token', 'asset-ref' => is_string( $value ),
			'enum' => is_string( $value ) && in_array( $value, $property['options'] ?? [], true ),
			'rich-text' => is_string( $value ) || ( $value instanceof \stdClass && \Blixis\Builder\Render\RichText::valid( $value ) ), 'boolean' => is_bool( $value ), 'number', 'integer' => is_int( $value ) || is_float( $value ),
			'array<string>' => is_array( $value ) && array_is_list( $value ) && count( array_filter( $value, 'is_string' ) ) === count( $value ),
			'array<number>', 'array<object>' => is_array( $value ) && array_is_list( $value ), 'object' => is_array( $value ) && ! array_is_list( $value ), default => false };
		if ( ! $valid ) {
			return false;
		}
		if ( is_string( $value ) && isset( $property['options'] ) && ! in_array( $value, $property['options'], true ) ) {
			return false;
		}
		if ( is_numeric( $value ) ) {
			if ( isset( $property['min'] ) && $value < $property['min'] ) {
				return false;
			} if ( isset( $property['max'] ) && $value > $property['max'] ) {
				return false;
			}
		}
		return true;
	}
	/** Inspect nested prop values for HTML, unsafe URL properties, and oversized text.
	 *
	 * @param string   $key Property name.
	 * @param mixed    $value Property value.
	 * @param string   $path JSON path.
	 * @param string[] $errors Errors to append.
	 */
	private function inspect_prop( string $key, mixed $value, string $path, array &$errors ): void {
		if ( is_string( $value ) ) {
			if ( strlen( $value ) > 10000 ) {
				$errors[] = "$path exceeds string size limit"; }
			if ( preg_match( '/<\/?[a-z][^>]*>/i', $value ) ) {
				$errors[] = "$path contains raw HTML"; }
			if ( in_array( strtolower( $key ), [ 'href','url','src','link' ], true ) && ! \Blixis\Builder\Registry\SafeUrl::accepts( $value ) ) {
				$errors[] = "$path is unsafe URL"; }
		} elseif ( is_array( $value ) ) {
			foreach ( $value as $child_key => $child ) {
				$this->inspect_prop( (string) $child_key, $child, "$path.$child_key", $errors ); }
		}
	}
}
